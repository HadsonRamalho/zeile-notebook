use std::sync::Mutex;

use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use tower::ServiceExt;

use crate::middleware::rate_limit::{GLOBAL_ORIGIN, OFF_VAR, exempt_path, global_limit_off};
use crate::routes::test_support::router_with_unreachable_database;

/// `ZEILE_RATE_LIMIT_OFF` is process-wide env state read by every request through
/// `enforce_global`. The test harness runs tests in this file on separate threads
/// concurrently, so without this lock `the_global_ceiling_can_be_turned_off_for_load_testing`
/// flipping the env var races the other tests' assumption that the ceiling is on.
static OFF_VAR_LOCK: Mutex<()> = Mutex::new(());

fn anonymous(path: &str, peer: &str) -> Request<Body> {
    let peer: std::net::SocketAddr = peer.parse().expect("peer address");

    Request::builder()
        .method("GET")
        .uri(path)
        .extension(axum::extract::ConnectInfo(peer))
        .body(Body::empty())
        .expect("request")
}

#[test]
fn service_health_is_not_counted_against_the_quota() {
    for exempt in ["/health/live", "/health/ready", "/internal/shutdown"] {
        assert!(
            exempt_path(exempt),
            "{exempt} should be exempt from the quota"
        );
    }

    assert!(!exempt_path("/api/notebook/create"));
}

#[test]
fn the_global_ceiling_can_be_turned_off_for_load_testing() {
    let _guard = OFF_VAR_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    unsafe { std::env::set_var(OFF_VAR, "1") };
    assert!(global_limit_off());

    unsafe { std::env::set_var(OFF_VAR, "off") };
    assert!(!global_limit_off());

    unsafe { std::env::remove_var(OFF_VAR) };
    assert!(!global_limit_off());
}

#[tokio::test]
async fn anonymous_traffic_has_a_per_origin_ceiling() {
    let _guard = OFF_VAR_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let router = router_with_unreachable_database().await;
    let peer = "203.0.113.10:5000";

    for i in 0..GLOBAL_ORIGIN.max {
        let response = router
            .clone()
            .oneshot(anonymous("/api/common", peer))
            .await
            .expect("response");

        assert_ne!(
            response.status(),
            StatusCode::TOO_MANY_REQUESTS,
            "cut off at request {i}, before the ceiling of {}",
            GLOBAL_ORIGIN.max
        );
    }

    let over_the_limit = router
        .oneshot(anonymous("/api/common", peer))
        .await
        .expect("response");

    assert_eq!(over_the_limit.status(), StatusCode::TOO_MANY_REQUESTS);
}

#[tokio::test]
async fn health_keeps_responding_after_the_ceiling() {
    let _guard = OFF_VAR_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let router = router_with_unreachable_database().await;
    let peer = "203.0.113.11:5000";

    for _ in 0..GLOBAL_ORIGIN.max + 5 {
        let _ = router
            .clone()
            .oneshot(anonymous("/api/common", peer))
            .await
            .expect("response");
    }

    let health = router
        .oneshot(anonymous("/health/live", peer))
        .await
        .expect("response");

    assert_ne!(
        health.status(),
        StatusCode::TOO_MANY_REQUESTS,
        "the health check was blocked by the quota; the orchestrator would kill the pod"
    );
}

#[tokio::test]
async fn one_exhausted_origin_does_not_affect_another() {
    let _guard = OFF_VAR_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let router = router_with_unreachable_database().await;

    for _ in 0..GLOBAL_ORIGIN.max + 5 {
        let _ = router
            .clone()
            .oneshot(anonymous("/api/common", "203.0.113.12:5000"))
            .await
            .expect("response");
    }

    let other = router
        .oneshot(anonymous("/api/common", "203.0.113.13:5000"))
        .await
        .expect("response");

    assert_ne!(other.status(), StatusCode::TOO_MANY_REQUESTS);
}

#[tokio::test]
async fn mass_registration_is_blocked() {
    let _guard = OFF_VAR_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let router = router_with_unreachable_database().await;
    let peer: std::net::SocketAddr = "203.0.113.20:5000".parse().expect("peer");

    let register = || {
        Request::builder()
            .method("POST")
            .uri("/api/user/register")
            .header(header::CONTENT_TYPE, "application/json")
            .extension(axum::extract::ConnectInfo(peer))
            .body(Body::from(br#"{}"#.to_vec()))
            .expect("request")
    };

    let mut was_limited = false;

    for _ in 0..crate::middleware::rate_limit::REGISTER.max + 3 {
        let response = router.clone().oneshot(register()).await.expect("response");

        if response.status() == StatusCode::TOO_MANY_REQUESTS {
            was_limited = true;
            break;
        }
    }

    assert!(
        was_limited,
        "/register accepted mass registration without a quota"
    );
}

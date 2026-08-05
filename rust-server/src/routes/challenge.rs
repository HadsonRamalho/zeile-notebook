use std::sync::Arc;

use axum::routing::{delete, get, post};
use utoipa_axum::router::OpenApiRouter;

use crate::{
    controllers::challenge::{
        api_add_test_case, api_create_challenge, api_delete_reference, api_delete_test_case,
        api_get_challenge, api_get_challenge_by_id, api_get_reference, api_get_submission,
        api_leaderboard, api_list_challenges, api_list_my_submissions, api_list_test_cases,
        api_run_samples, api_set_reference, api_submit, api_update_challenge,
    },
    models::state::AppState,
};

pub async fn challenge_routes() -> OpenApiRouter<Arc<AppState>> {
    OpenApiRouter::<Arc<AppState>>::new()
        .route("/list", get(api_list_challenges))
        .route("/create", post(api_create_challenge))
        .route("/slug/{slug}", get(api_get_challenge))
        .route(
            "/{id}",
            get(api_get_challenge_by_id).put(api_update_challenge),
        )
        .route(
            "/{id}/test-cases",
            get(api_list_test_cases).post(api_add_test_case),
        )
        .route("/{id}/test-cases/{case_id}", delete(api_delete_test_case))
        .route(
            "/{id}/reference",
            get(api_get_reference).post(api_set_reference),
        )
        .route("/{id}/reference/{language}", delete(api_delete_reference))
        .route(
            "/{id}/submit",
            post(api_submit).route_layer(crate::rate_limit!(
                "challenge-submit",
                crate::middleware::rate_limit::JUDGE
            )),
        )
        .route(
            "/{id}/run",
            post(api_run_samples).route_layer(crate::rate_limit!(
                "challenge-run",
                crate::middleware::rate_limit::JUDGE
            )),
        )
        .route("/{id}/submissions", get(api_list_my_submissions))
        .route("/{id}/leaderboard", get(api_leaderboard))
        .route("/submissions/{submission_id}", get(api_get_submission))
}

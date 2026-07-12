use std::sync::Arc;

use axum::routing::{get, post, put};
use utoipa_axum::router::OpenApiRouter;

use crate::{
    controllers::challenge::{
        api_add_test_case, api_create_challenge, api_get_challenge, api_get_submission,
        api_leaderboard, api_list_challenges, api_list_my_submissions, api_set_reference,
        api_submit, api_update_challenge,
    },
    models::state::AppState,
};

pub async fn challenge_routes() -> OpenApiRouter<Arc<AppState>> {
    let routes = OpenApiRouter::<Arc<AppState>>::new()
        .route("/", get(api_list_challenges).post(api_create_challenge))
        .route("/slug/{slug}", get(api_get_challenge))
        .route("/{id}", put(api_update_challenge))
        .route("/{id}/test-cases", post(api_add_test_case))
        .route("/{id}/reference", post(api_set_reference))
        .route("/{id}/submit", post(api_submit))
        .route("/{id}/submissions", get(api_list_my_submissions))
        .route("/{id}/leaderboard", get(api_leaderboard))
        .route("/submissions/{submission_id}", get(api_get_submission));

    routes
}

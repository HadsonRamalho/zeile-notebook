use diesel_async::AsyncPgConnection;
use hyper::HeaderMap;

use crate::controllers::jwt::extract_claims_from_header;
use crate::models::error::ApiError;
use crate::models::user::UserRole;

/// Re-checks the role against the DB — `claims.role` is a JWT snapshot from
/// issuance time and doesn't track demotion.
pub async fn check_admin_role(
    conn: &mut AsyncPgConnection,
    headers: &HeaderMap,
) -> Result<(), ApiError> {
    let claims = extract_claims_from_header(headers).await?.1;

    let user = crate::models::user::find_user_by_id(conn, &claims.id).await?;

    if claims.role != UserRole::Admin || user.role != UserRole::Admin {
        return Err(ApiError::InvalidAuthorizationToken);
    }

    Ok(())
}

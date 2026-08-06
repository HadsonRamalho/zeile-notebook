use diesel_async::AsyncPgConnection;
use hyper::HeaderMap;

use crate::controllers::jwt::extract_claims_from_header;
use crate::domain::user::UserRole;
use crate::models::error::ApiError;

pub async fn check_admin_role(
    conn: &mut AsyncPgConnection,
    headers: &HeaderMap,
) -> Result<(), ApiError> {
    let claims = extract_claims_from_header(headers).await?.1;

    let user = crate::domain::user::find_user_by_id(conn, &claims.id).await?;

    if claims.role != UserRole::Admin || user.role != UserRole::Admin {
        return Err(ApiError::InvalidAuthorizationToken);
    }

    Ok(())
}

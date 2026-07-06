// @generated automatically by Diesel CLI.

pub mod sql_types {
    #[derive(diesel::query_builder::QueryId, diesel::sql_types::SqlType)]
    #[diesel(postgres_type(name = "auth_provider"))]
    pub struct AuthProvider;

    #[derive(diesel::query_builder::QueryId, diesel::sql_types::SqlType)]
    #[diesel(postgres_type(name = "block_type_enum"))]
    pub struct BlockTypeEnum;

    #[derive(diesel::query_builder::QueryId, diesel::sql_types::SqlType)]
    #[diesel(postgres_type(name = "language_enum"))]
    pub struct LanguageEnum;

    #[derive(diesel::query_builder::QueryId, diesel::sql_types::SqlType)]
    #[diesel(postgres_type(name = "user_role"))]
    pub struct UserRole;
}

diesel::table! {
    use diesel::sql_types::*;
    use super::sql_types::BlockTypeEnum;
    use super::sql_types::LanguageEnum;

    blocks (id) {
        id -> Uuid,
        notebook_id -> Uuid,
        title -> Text,
        block_type -> BlockTypeEnum,
        language -> Nullable<LanguageEnum>,
        content -> Text,
        metadata -> Nullable<Jsonb>,
        position -> Int4,
    }
}

diesel::table! {
    notebooks (id) {
        id -> Uuid,
        user_id -> Nullable<Uuid>,
        #[max_length = 255]
        title -> Varchar,
        created_at -> Timestamptz,
        updated_at -> Timestamptz,
        is_public -> Bool,
        document_data -> Nullable<Bytea>,
        team_id -> Nullable<Uuid>,
    }
}

diesel::table! {
    team_invitations (id) {
        id -> Uuid,
        team_id -> Uuid,
        role_id -> Uuid,
        email -> Varchar,
        token -> Varchar,
        expires_at -> Timestamp,
        created_at -> Timestamp,
    }
}

diesel::table! {
    team_members (id) {
        id -> Uuid,
        team_id -> Uuid,
        user_id -> Uuid,
        role_id -> Uuid,
        joined_at -> Timestamp,
    }
}

diesel::table! {
    team_roles (id) {
        id -> Uuid,
        team_id -> Uuid,
        name -> Varchar,
        can_read -> Bool,
        can_write -> Bool,
        can_manage_privacy -> Bool,
        can_manage_clones -> Bool,
        can_invite_users -> Bool,
        can_remove_users -> Bool,
        can_manage_permissions -> Bool,
        created_at -> Timestamp,
        can_manage_team -> Bool,
    }
}

diesel::table! {
    teams (id) {
        id -> Uuid,
        name -> Varchar,
        description -> Nullable<Text>,
        image_url -> Nullable<Varchar>,
        created_at -> Timestamp,
        updated_at -> Timestamp,
    }
}

diesel::table! {
    use diesel::sql_types::*;
    use super::sql_types::AuthProvider;
    use super::sql_types::UserRole;

    users (id) {
        id -> Uuid,
        public_id -> Int4,
        #[max_length = 255]
        name -> Varchar,
        #[max_length = 255]
        email -> Varchar,
        avatar_url -> Nullable<Text>,
        #[max_length = 255]
        password_hash -> Nullable<Varchar>,
        primary_provider -> AuthProvider,
        #[max_length = 255]
        github_id -> Nullable<Varchar>,
        #[max_length = 255]
        google_id -> Nullable<Varchar>,
        role -> UserRole,
        is_active -> Bool,
        created_at -> Timestamptz,
        updated_at -> Timestamptz,
        deleted_at -> Nullable<Timestamptz>,
    }
}

diesel::joinable!(blocks -> notebooks (notebook_id));
diesel::joinable!(notebooks -> teams (team_id));
diesel::joinable!(notebooks -> users (user_id));
diesel::joinable!(team_invitations -> team_roles (role_id));
diesel::joinable!(team_invitations -> teams (team_id));
diesel::joinable!(team_members -> team_roles (role_id));
diesel::joinable!(team_members -> teams (team_id));
diesel::joinable!(team_members -> users (user_id));
diesel::joinable!(team_roles -> teams (team_id));

diesel::allow_tables_to_appear_in_same_query!(
    blocks,
    notebooks,
    team_invitations,
    team_members,
    team_roles,
    teams,
    users,
);

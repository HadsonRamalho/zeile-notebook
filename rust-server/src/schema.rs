// @generated automatically by Diesel CLI.

pub mod sql_types {
    #[derive(diesel::query_builder::QueryId, diesel::sql_types::SqlType)]
    #[diesel(postgres_type(name = "auth_provider"))]
    pub struct AuthProvider;

    #[derive(diesel::query_builder::QueryId, diesel::sql_types::SqlType)]
    #[diesel(postgres_type(name = "block_type_enum"))]
    pub struct BlockTypeEnum;

    #[derive(diesel::query_builder::QueryId, diesel::sql_types::SqlType)]
    #[diesel(postgres_type(name = "grant_effect"))]
    pub struct GrantEffect;

    #[derive(diesel::query_builder::QueryId, diesel::sql_types::SqlType)]
    #[diesel(postgres_type(name = "grant_subject_kind"))]
    pub struct GrantSubjectKind;

    #[derive(diesel::query_builder::QueryId, diesel::sql_types::SqlType)]
    #[diesel(postgres_type(name = "grant_target_kind"))]
    pub struct GrantTargetKind;

    #[derive(diesel::query_builder::QueryId, diesel::sql_types::SqlType)]
    #[diesel(postgres_type(name = "language_enum"))]
    pub struct LanguageEnum;

    #[derive(diesel::query_builder::QueryId, diesel::sql_types::SqlType)]
    #[diesel(postgres_type(name = "tsvector", schema = "pg_catalog"))]
    pub struct Tsvector;

    #[derive(diesel::query_builder::QueryId, diesel::sql_types::SqlType)]
    #[diesel(postgres_type(name = "user_role"))]
    pub struct UserRole;
}

diesel::table! {
    use diesel::sql_types::*;
    use super::sql_types::BlockTypeEnum;
    use super::sql_types::LanguageEnum;
    use super::sql_types::Tsvector;

    blocks (id) {
        id -> Uuid,
        notebook_id -> Uuid,
        title -> Text,
        block_type -> BlockTypeEnum,
        language -> Nullable<LanguageEnum>,
        content -> Text,
        metadata -> Nullable<Jsonb>,
        position -> Int4,
        search_tsv -> Nullable<Tsvector>,
    }
}

diesel::table! {
    challenge_submission_results (id) {
        id -> Uuid,
        submission_id -> Uuid,
        test_case_id -> Nullable<Uuid>,
        #[max_length = 8]
        verdict -> Varchar,
        runtime_ms -> Int4,
        is_hidden -> Bool,
        stderr_snippet -> Nullable<Text>,
        ord -> Int4,
    }
}

diesel::table! {
    challenge_submissions (id) {
        id -> Uuid,
        challenge_id -> Uuid,
        user_id -> Nullable<Uuid>,
        #[max_length = 16]
        language -> Varchar,
        code -> Text,
        #[max_length = 16]
        status -> Varchar,
        score -> Int4,
        max_score -> Int4,
        runtime_ms -> Int4,
        error_message -> Nullable<Text>,
        created_at -> Timestamptz,
        judged_at -> Nullable<Timestamptz>,
    }
}

diesel::table! {
    challenge_test_cases (id) {
        id -> Uuid,
        challenge_id -> Uuid,
        input -> Text,
        expected -> Nullable<Text>,
        is_hidden -> Bool,
        weight -> Int4,
        ord -> Int4,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    challenges (id) {
        id -> Uuid,
        #[max_length = 255]
        slug -> Varchar,
        #[max_length = 255]
        title -> Varchar,
        statement_md -> Text,
        #[max_length = 32]
        difficulty -> Varchar,
        tags -> Jsonb,
        languages -> Jsonb,
        #[max_length = 16]
        judge_mode -> Varchar,
        time_limit_ms -> Int4,
        mem_limit_kb -> Int4,
        starter_code -> Nullable<Jsonb>,
        reference_solution -> Nullable<Text>,
        #[max_length = 16]
        reference_language -> Nullable<Varchar>,
        property_spec -> Nullable<Jsonb>,
        team_id -> Nullable<Uuid>,
        created_by -> Nullable<Uuid>,
        #[max_length = 16]
        visibility -> Varchar,
        created_at -> Timestamptz,
        updated_at -> Timestamptz,
        notebook_id -> Nullable<Uuid>,
        block_id -> Nullable<Uuid>,
        reference_solutions -> Nullable<Jsonb>,
    }
}

diesel::table! {
    chat_message_versions (id) {
        id -> Uuid,
        message_id -> Uuid,
        content -> Text,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    chat_messages (id) {
        id -> Uuid,
        notebook_id -> Nullable<Uuid>,
        team_id -> Nullable<Uuid>,
        user_id -> Nullable<Uuid>,
        #[max_length = 255]
        author_name -> Varchar,
        content -> Text,
        parent_id -> Nullable<Uuid>,
        quoted_message_id -> Nullable<Uuid>,
        is_edited -> Bool,
        edited_at -> Nullable<Timestamptz>,
        deleted_at -> Nullable<Timestamptz>,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    comment_threads (id) {
        id -> Uuid,
        notebook_id -> Uuid,
        block_id -> Text,
        anchor_offset -> Nullable<Int4>,
        #[max_length = 16]
        status -> Varchar,
        created_by -> Nullable<Uuid>,
        created_at -> Timestamptz,
        updated_at -> Timestamptz,
    }
}

diesel::table! {
    comments (id) {
        id -> Uuid,
        thread_id -> Uuid,
        author_id -> Nullable<Uuid>,
        #[max_length = 255]
        author_name -> Varchar,
        body -> Text,
        created_at -> Timestamptz,
        updated_at -> Timestamptz,
        deleted_at -> Nullable<Timestamptz>,
    }
}

diesel::table! {
    folders (id) {
        id -> Uuid,
        #[max_length = 255]
        name -> Varchar,
        user_id -> Nullable<Uuid>,
        team_id -> Nullable<Uuid>,
        created_at -> Timestamptz,
        updated_at -> Timestamptz,
        tags -> Jsonb,
    }
}

diesel::table! {
    notebook_activity (id) {
        id -> Uuid,
        notebook_id -> Uuid,
        actor_id -> Nullable<Uuid>,
        #[max_length = 255]
        actor_name -> Varchar,
        #[max_length = 32]
        kind -> Varchar,
        block_id -> Nullable<Text>,
        summary -> Nullable<Text>,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    notebook_snapshots (id) {
        id -> Uuid,
        notebook_id -> Uuid,
        #[max_length = 120]
        label -> Varchar,
        note -> Nullable<Text>,
        document_data -> Bytea,
        #[max_length = 16]
        kind -> Varchar,
        created_by -> Nullable<Uuid>,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    use diesel::sql_types::*;
    use super::sql_types::Tsvector;

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
        search_text -> Text,
        folder_id -> Nullable<Uuid>,
        tags -> Jsonb,
        search_tsv -> Nullable<Tsvector>,
    }
}

diesel::table! {
    notification_preferences (id) {
        id -> Uuid,
        user_id -> Uuid,
        #[max_length = 16]
        scope_kind -> Varchar,
        scope_id -> Nullable<Uuid>,
        push_enabled -> Bool,
        inapp_enabled -> Bool,
        chat_enabled -> Bool,
        created_at -> Timestamptz,
        updated_at -> Timestamptz,
    }
}

diesel::table! {
    notifications (id) {
        id -> Uuid,
        user_id -> Uuid,
        #[max_length = 64]
        kind -> Varchar,
        #[max_length = 255]
        title -> Varchar,
        body -> Text,
        url -> Nullable<Text>,
        notebook_id -> Nullable<Uuid>,
        team_id -> Nullable<Uuid>,
        read_at -> Nullable<Timestamptz>,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    use diesel::sql_types::*;
    use super::sql_types::GrantSubjectKind;
    use super::sql_types::GrantTargetKind;
    use super::sql_types::GrantEffect;

    permission_grants (id) {
        id -> Uuid,
        subject_kind -> GrantSubjectKind,
        subject_id -> Nullable<Uuid>,
        subject_principal -> Nullable<Varchar>,
        scope_team_id -> Nullable<Uuid>,
        permission_key -> Varchar,
        target_kind -> GrantTargetKind,
        target_id -> Nullable<Uuid>,
        target_value -> Nullable<Varchar>,
        effect -> GrantEffect,
        created_at -> Timestamp,
    }
}

diesel::table! {
    push_subscriptions (id) {
        id -> Uuid,
        user_id -> Uuid,
        endpoint -> Text,
        p256dh -> Text,
        auth -> Text,
        created_at -> Timestamp,
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
    template_versions (id) {
        id -> Uuid,
        template_id -> Uuid,
        version -> Int4,
        named_sources -> Jsonb,
        note -> Nullable<Text>,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    templates (id) {
        id -> Uuid,
        #[max_length = 32]
        kind -> Varchar,
        #[max_length = 255]
        name -> Varchar,
        user_id -> Nullable<Uuid>,
        team_id -> Nullable<Uuid>,
        source_notebook_id -> Nullable<Uuid>,
        is_public -> Bool,
        latest_version -> Int4,
        created_at -> Timestamptz,
        updated_at -> Timestamptz,
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
diesel::joinable!(challenge_submission_results -> challenge_submissions (submission_id));
diesel::joinable!(challenge_submission_results -> challenge_test_cases (test_case_id));
diesel::joinable!(challenge_submissions -> challenges (challenge_id));
diesel::joinable!(challenge_submissions -> users (user_id));
diesel::joinable!(challenge_test_cases -> challenges (challenge_id));
diesel::joinable!(challenges -> notebooks (notebook_id));
diesel::joinable!(challenges -> teams (team_id));
diesel::joinable!(challenges -> users (created_by));
diesel::joinable!(chat_message_versions -> chat_messages (message_id));
diesel::joinable!(chat_messages -> notebooks (notebook_id));
diesel::joinable!(chat_messages -> teams (team_id));
diesel::joinable!(chat_messages -> users (user_id));
diesel::joinable!(comment_threads -> notebooks (notebook_id));
diesel::joinable!(comment_threads -> users (created_by));
diesel::joinable!(comments -> comment_threads (thread_id));
diesel::joinable!(comments -> users (author_id));
diesel::joinable!(folders -> teams (team_id));
diesel::joinable!(folders -> users (user_id));
diesel::joinable!(notebook_activity -> notebooks (notebook_id));
diesel::joinable!(notebook_activity -> users (actor_id));
diesel::joinable!(notebook_snapshots -> notebooks (notebook_id));
diesel::joinable!(notebook_snapshots -> users (created_by));
diesel::joinable!(notebooks -> folders (folder_id));
diesel::joinable!(notebooks -> teams (team_id));
diesel::joinable!(notebooks -> users (user_id));
diesel::joinable!(notification_preferences -> users (user_id));
diesel::joinable!(notifications -> notebooks (notebook_id));
diesel::joinable!(notifications -> teams (team_id));
diesel::joinable!(notifications -> users (user_id));
diesel::joinable!(permission_grants -> teams (scope_team_id));
diesel::joinable!(push_subscriptions -> users (user_id));
diesel::joinable!(team_invitations -> team_roles (role_id));
diesel::joinable!(team_invitations -> teams (team_id));
diesel::joinable!(team_members -> team_roles (role_id));
diesel::joinable!(team_members -> teams (team_id));
diesel::joinable!(team_members -> users (user_id));
diesel::joinable!(team_roles -> teams (team_id));
diesel::joinable!(template_versions -> templates (template_id));
diesel::joinable!(templates -> notebooks (source_notebook_id));
diesel::joinable!(templates -> teams (team_id));
diesel::joinable!(templates -> users (user_id));

diesel::allow_tables_to_appear_in_same_query!(
    blocks,
    challenge_submission_results,
    challenge_submissions,
    challenge_test_cases,
    challenges,
    chat_message_versions,
    chat_messages,
    comment_threads,
    comments,
    folders,
    notebook_activity,
    notebook_snapshots,
    notebooks,
    notification_preferences,
    notifications,
    permission_grants,
    push_subscriptions,
    team_invitations,
    team_members,
    team_roles,
    teams,
    template_versions,
    templates,
    users,
);

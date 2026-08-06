use std::collections::HashSet;

use diesel_async::AsyncPgConnection;
use uuid::Uuid;

use crate::models::error::ApiError;

use super::dto::{RolePermissions, UpdateTeamRole};
use super::entity::{NewTeamRole, TeamMember, TeamRole};
use super::repository;

pub fn get_default_roles(team_id: &Uuid) -> Vec<(NewTeamRole, RolePermissions)> {
    let admin_role = (
        NewTeamRole {
            team_id: *team_id,
            name: "Owner".to_string(),
        },
        RolePermissions::all(),
    );

    let member_role = (
        NewTeamRole {
            team_id: *team_id,
            name: "Member".to_string(),
        },
        RolePermissions {
            can_read: true,
            can_write: true,
            ..RolePermissions::default()
        },
    );

    vec![admin_role, member_role]
}

pub async fn get_team_member(
    conn: &mut AsyncPgConnection,
    team_id: Uuid,
    user_id: Uuid,
) -> Result<(TeamMember, TeamRole), ApiError> {
    match repository::find_team_member_with_role(conn, team_id, user_id).await {
        Ok(m) => Ok(m),
        Err(_) => Err(ApiError::InvalidAuthorizationToken),
    }
}

impl RolePermissions {
    pub fn all() -> Self {
        Self {
            can_read: true,
            can_write: true,
            can_manage_privacy: true,
            can_manage_clones: true,
            can_invite_users: true,
            can_remove_users: true,
            can_manage_permissions: true,
            can_manage_team: true,
        }
    }

    pub fn view_only() -> Self {
        Self {
            can_read: true,
            ..Self::default()
        }
    }

    pub fn grant_keys(&self) -> Vec<&'static str> {
        let mut keys = Vec::new();
        if self.can_read {
            keys.extend(["notebook.view", "chat.view"]);
        }
        if self.can_write {
            keys.extend([
                "notebook.edit",
                "notebook.blocks.execute",
                "chat.messages.send",
            ]);
        }
        if self.can_manage_privacy {
            keys.push("notebook.manage_privacy");
        }
        if self.can_manage_clones {
            keys.push("notebook.manage_clones");
        }
        if self.can_invite_users {
            keys.push("team.invite_users");
        }
        if self.can_remove_users {
            keys.push("team.remove_users");
        }
        if self.can_manage_permissions {
            keys.extend([
                "team.roles.edit_role_permissions",
                "team.roles.create_role",
                "team.roles.edit_role_name",
            ]);
        }
        if self.can_manage_team {
            keys.push("team.manage");
            keys.push("chat.messages.delete_any");
        }
        keys
    }

    pub fn from_grant_keys(keys: &HashSet<String>) -> Self {
        let has = |key: &str| keys.contains(key);
        Self {
            can_read: has("notebook.view"),
            can_write: has("notebook.edit"),
            can_manage_privacy: has("notebook.manage_privacy"),
            can_manage_clones: has("notebook.manage_clones"),
            can_invite_users: has("team.invite_users"),
            can_remove_users: has("team.remove_users"),
            can_manage_permissions: has("team.roles.edit_role_permissions"),
            can_manage_team: has("team.manage"),
        }
    }
}

impl UpdateTeamRole {
    pub fn apply(&self, current: RolePermissions) -> RolePermissions {
        RolePermissions {
            can_read: self.can_read.unwrap_or(current.can_read),
            can_write: self.can_write.unwrap_or(current.can_write),
            can_manage_privacy: self
                .can_manage_privacy
                .unwrap_or(current.can_manage_privacy),
            can_manage_clones: self.can_manage_clones.unwrap_or(current.can_manage_clones),
            can_invite_users: self.can_invite_users.unwrap_or(current.can_invite_users),
            can_remove_users: self.can_remove_users.unwrap_or(current.can_remove_users),
            can_manage_permissions: self
                .can_manage_permissions
                .unwrap_or(current.can_manage_permissions),
            can_manage_team: self.can_manage_team.unwrap_or(current.can_manage_team),
        }
    }
}

pub fn email_matches(invited: &str, user: &str) -> bool {
    invited.trim().eq_ignore_ascii_case(user.trim())
}

#[cfg(test)]
mod invitation_tests {
    use super::email_matches;

    #[test]
    fn the_same_email_matches() {
        assert!(email_matches("person@example.test", "person@example.test"));
    }

    #[test]
    fn case_and_whitespace_do_not_prevent_a_match() {
        assert!(email_matches("Person@Example.Test", "person@example.test"));
        assert!(email_matches(
            "  person@example.test  ",
            "person@example.test"
        ));
        assert!(email_matches(
            "person@example.test",
            " PERSON@example.TEST "
        ));
    }

    #[test]
    fn a_different_email_does_not_match() {
        assert!(!email_matches(
            "invited@example.test",
            "intruder@example.test"
        ));
    }

    #[test]
    fn a_prefix_does_not_count_as_a_match() {
        assert!(!email_matches(
            "person@example.test",
            "person@example.test.br"
        ));
        assert!(!email_matches("person@example.test", "person"));
        assert!(!email_matches("", "person@example.test"));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn keys_of(permissions: RolePermissions) -> HashSet<String> {
        permissions
            .grant_keys()
            .into_iter()
            .map(|key| key.to_string())
            .collect()
    }

    #[test]
    fn the_bools_survive_a_round_trip_through_the_grants() {
        let cases = [
            RolePermissions::default(),
            RolePermissions::view_only(),
            RolePermissions::all(),
            RolePermissions {
                can_read: true,
                can_write: true,
                can_remove_users: true,
                ..RolePermissions::default()
            },
        ];

        for case in cases {
            assert_eq!(RolePermissions::from_grant_keys(&keys_of(case)), case);
        }
    }

    #[test]
    fn the_role_json_keeps_the_eight_bools_at_the_top_level() {
        let role =
            super::super::dto::TeamRoleView::synthetic("Owner", RolePermissions::view_only());
        let json = serde_json::to_value(&role).expect("serialize");

        assert_eq!(json["name"], "Owner");
        assert_eq!(json["canRead"], true);
        for key in [
            "canWrite",
            "canManagePrivacy",
            "canManageClones",
            "canInviteUsers",
            "canRemoveUsers",
            "canManagePermissions",
            "canManageTeam",
        ] {
            assert_eq!(json[key], false, "{key} should come back as false");
        }
    }

    #[test]
    fn role_permissions_accept_the_legacy_snake_case_alias() {
        let camel: RolePermissions = serde_json::from_str(
            r#"{"canRead":true,"canWrite":false,"canManagePrivacy":false,"canManageClones":false,"canInviteUsers":false,"canRemoveUsers":false,"canManagePermissions":false,"canManageTeam":false}"#,
        )
        .unwrap();
        let snake: RolePermissions = serde_json::from_str(
            r#"{"can_read":true,"can_write":false,"can_manage_privacy":false,"can_manage_clones":false,"can_invite_users":false,"can_remove_users":false,"can_manage_permissions":false,"can_manage_team":false}"#,
        )
        .unwrap();

        assert_eq!(camel, snake);
    }

    #[test]
    fn a_partial_edit_preserves_what_was_not_sent() {
        let current = RolePermissions::all();
        let payload = UpdateTeamRole {
            id: Uuid::new_v4(),
            name: None,
            can_read: None,
            can_write: Some(false),
            can_manage_privacy: None,
            can_manage_clones: None,
            can_invite_users: None,
            can_remove_users: None,
            can_manage_permissions: None,
            can_manage_team: None,
        };

        let result = payload.apply(current);

        assert!(!result.can_write);
        assert!(result.can_read);
        assert!(result.can_manage_team);
    }
}

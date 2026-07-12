DELETE FROM permission_grants
WHERE subject_kind = 'role'
    AND permission_key = 'chat.messages.delete_any'
    AND target_kind = 'team';

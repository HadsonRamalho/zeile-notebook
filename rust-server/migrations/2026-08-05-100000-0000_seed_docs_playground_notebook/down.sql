-- Destrutividade: reversível. Remove apenas as linhas de seed inseridas pelo
-- up.sql (usuário de sistema, notebook fixo e grant); nenhum bloco é
-- persistido nesse notebook em uso normal, então não há dado real em risco.
DELETE FROM permission_grants
WHERE subject_kind = 'principal'
    AND subject_principal = 'authenticated'
    AND permission_key = 'notebook.blocks.execute'
    AND target_kind = 'notebook'
    AND target_id = '11111111-1111-1111-1111-111111111111';

DELETE FROM notebooks WHERE id = '11111111-1111-1111-1111-111111111111';
DELETE FROM users WHERE id = '22222222-2222-2222-2222-222222222222';

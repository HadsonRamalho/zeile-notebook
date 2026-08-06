use super::entity::Comment;

pub fn mask_deleted(mut comment: Comment) -> Comment {
    if comment.deleted_at.is_some() {
        comment.body = String::new();
    }
    comment
}

pub fn mentions_name(text: &str, name: &str) -> bool {
    let pattern = format!("@{}", name);
    text.to_lowercase().contains(&pattern.to_lowercase())
}

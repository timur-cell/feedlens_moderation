class AddModerationLockToListings < ActiveRecord::Migration[8.1]
  # A locked listing carries a final human decision (approve/reject forever):
  # automated re-moderation, webhook replays and re-imports must not change
  # its moderation_status until a moderator explicitly unlocks it.
  def change
    add_column :listings, :moderation_locked, :boolean, default: false, null: false
    add_column :listings, :moderation_locked_at, :bigint
    add_column :listings, :moderation_locked_by, :string
    add_index :listings, :moderation_locked
  end
end

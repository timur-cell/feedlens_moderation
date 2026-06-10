class CreateModerationNotes < ActiveRecord::Migration[8.1]
  def change
    create_table :moderation_notes do |t|
      t.references :listing, null: false, foreign_key: true
      t.string :je_id, null: false
      t.string :author_name, null: false
      t.string :author_role
      t.text :content, null: false
      t.bigint :created_at_ms, null: false

      t.timestamps
    end

    add_index :moderation_notes, :je_id
    add_index :moderation_notes, :created_at_ms
  end
end

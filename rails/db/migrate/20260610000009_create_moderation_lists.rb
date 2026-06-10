class CreateModerationLists < ActiveRecord::Migration[8.1]
  def change
    create_table :moderation_lists do |t|
      t.string :name, null: false
      t.string :display_name, null: false
      t.text :description
      t.string :category, null: false
      t.string :source
      t.jsonb :items, null: false, default: []
      t.integer :item_count, null: false, default: 0
      t.bigint :updated_at_ms, null: false

      t.timestamps
    end

    add_index :moderation_lists, :name, unique: true
    add_index :moderation_lists, :category
  end
end

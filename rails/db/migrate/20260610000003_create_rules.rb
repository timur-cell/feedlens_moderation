class CreateRules < ActiveRecord::Migration[8.1]
  def change
    create_table :rules do |t|
      t.string :name, null: false
      t.string :display_name, null: false
      t.text :description
      t.string :category, null: false
      t.string :listing_category
      t.string :tier, null: false
      t.boolean :enabled, null: false, default: true
      t.string :action, null: false
      t.integer :priority, null: false
      t.jsonb :config, null: false, default: {}
      t.text :seller_message
      t.integer :match_count
      t.integer :false_positive_count
      t.bigint :last_matched_at
      t.bigint :created_at_ms
      t.bigint :last_modified_at
      t.string :last_modified_by

      t.timestamps
    end

    add_index :rules, :name, unique: true
    add_index :rules, :category
    add_index :rules, :enabled
    add_index :rules, :listing_category
  end
end

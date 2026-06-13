class CreateSavedViews < ActiveRecord::Migration[8.1]
  def change
    # Per-moderator saved filter sets (Decisions page). `query` is the
    # URL-encoded filter string; `scope` namespaces the view (e.g. "decisions").
    create_table :saved_views do |t|
      t.bigint :moderator_id, null: false
      t.string :name, null: false
      t.string :scope, null: false, default: "decisions"
      t.text :query, null: false, default: ""
      t.bigint :created_at_ms
      t.timestamps
    end
    add_index :saved_views, :moderator_id
    add_index :saved_views, %i[moderator_id scope]
  end
end

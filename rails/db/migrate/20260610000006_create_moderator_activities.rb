class CreateModeratorActivities < ActiveRecord::Migration[8.1]
  def change
    create_table :moderator_activities do |t|
      t.references :moderator, null: false, foreign_key: true
      t.string :moderator_name, null: false
      t.string :action, null: false
      t.string :target_type
      t.string :target_id
      t.text :details
      t.bigint :timestamp, null: false

      t.timestamps
    end

    add_index :moderator_activities, :timestamp
  end
end

class CreateSyncStates < ActiveRecord::Migration[8.1]
  def change
    create_table :sync_states do |t|
      t.string :key, null: false
      t.datetime :watermark_at, precision: 6, null: false

      t.timestamps
    end

    add_index :sync_states, :key, unique: true
  end
end

class CreateDailyStats < ActiveRecord::Migration[8.1]
  def change
    create_table :daily_stats do |t|
      t.string :date, null: false
      t.integer :total, null: false, default: 0
      t.integer :approved, null: false, default: 0
      t.integer :rejected, null: false, default: 0
      t.integer :noticed, null: false, default: 0
      t.integer :manual, null: false, default: 0
      t.integer :llm_calls, null: false, default: 0
      t.float :avg_confidence

      t.timestamps
    end

    add_index :daily_stats, :date, unique: true
  end
end

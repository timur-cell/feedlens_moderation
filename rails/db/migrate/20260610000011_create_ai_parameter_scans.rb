class CreateAiParameterScans < ActiveRecord::Migration[8.1]
  def change
    create_table :ai_parameter_scans do |t|
      t.references :listing, null: false, foreign_key: true
      t.string :je_id, null: false
      t.string :verdict, null: false
      t.jsonb :flags, null: false, default: []
      t.integer :flag_count, null: false, default: 0
      t.text :summary, null: false
      t.float :confidence, null: false
      t.jsonb :parameters_checked
      t.string :model, null: false
      t.integer :tokens_used
      t.bigint :scanned_at, null: false

      t.timestamps
    end

    add_index :ai_parameter_scans, :je_id
    add_index :ai_parameter_scans, :verdict
    add_index :ai_parameter_scans, :scanned_at
    add_index :ai_parameter_scans, :flag_count
  end
end

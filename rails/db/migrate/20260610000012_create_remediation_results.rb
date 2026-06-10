class CreateRemediationResults < ActiveRecord::Migration[8.1]
  def change
    create_table :remediation_results do |t|
      t.references :listing, null: false, foreign_key: true
      t.string :je_id, null: false
      t.boolean :has_fixable_errors, null: false, default: false
      t.integer :error_count, null: false, default: 0
      t.float :total_confidence, null: false, default: 0
      t.jsonb :suggestions, null: false, default: []
      t.jsonb :description_score
      t.string :feed_source
      t.string :office
      t.string :category
      t.string :country
      t.string :model, null: false
      t.integer :tokens_used
      t.bigint :scanned_at, null: false

      t.timestamps
    end

    add_index :remediation_results, :je_id
    add_index :remediation_results, :has_fixable_errors
    add_index :remediation_results, :scanned_at
    add_index :remediation_results, :feed_source
    add_index :remediation_results, :office
  end
end

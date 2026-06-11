class CreateModerationResults < ActiveRecord::Migration[8.1]
  def change
    create_table :moderation_results do |t|
      t.references :listing, null: false, foreign_key: true
      t.string :je_id, null: false
      t.string :outcome, null: false
      t.jsonb :rule_matches, null: false, default: []
      t.boolean :llm_triggered, null: false, default: false
      t.jsonb :llm_response
      t.text :seller_message
      t.string :refuse_reason_type
      t.jsonb :vision_result
      t.string :vision_model
      t.float :confidence
      t.string :overridden_by
      t.bigint :overridden_at
      t.text :override_reason
      t.string :original_outcome
      t.bigint :processed_at, null: false

      t.timestamps
    end

    add_index :moderation_results, :je_id
    add_index :moderation_results, :outcome
    add_index :moderation_results, :processed_at
  end
end

class CreateImageRecognitionResults < ActiveRecord::Migration[8.1]
  def change
    create_table :image_recognition_results do |t|
      t.references :listing, null: true, foreign_key: true
      t.string :je_id, null: false
      t.string :title, null: false
      t.jsonb :image_urls, null: false, default: []
      t.string :llm, null: false
      t.jsonb :result
      t.bigint :analyzed_at, null: false

      t.timestamps
    end

    add_index :image_recognition_results, :je_id
    add_index :image_recognition_results, :llm
    add_index :image_recognition_results, :analyzed_at
  end
end

class CreateListingImageAnalyses < ActiveRecord::Migration[8.1]
  def change
    create_table :listing_image_analyses do |t|
      t.string :je_id, null: false
      t.string :title, null: false
      t.string :listing_url
      t.float :price
      t.string :currency
      t.string :country
      t.string :city
      t.string :state
      t.string :real_estate_type
      t.integer :bedrooms
      t.integer :bathrooms
      t.float :living_area
      t.string :office
      t.integer :total_images, null: false
      t.integer :analyzed_images, null: false
      t.jsonb :per_image_results
      t.jsonb :summary
      t.bigint :analyzed_at, null: false
      t.string :implio_status
      t.bigint :implio_submitted_at

      t.timestamps
    end

    add_index :listing_image_analyses, :je_id
    add_index :listing_image_analyses, :analyzed_at
  end
end

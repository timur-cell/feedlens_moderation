class CreateListings < ActiveRecord::Migration[8.1]
  def change
    create_table :listings do |t|
      t.string :je_id, null: false
      t.string :title, null: false
      t.float :price
      t.float :price_usd
      t.float :price_per_sqm
      t.string :currency
      t.boolean :price_on_request
      t.string :category
      t.string :real_estate_type
      t.string :country
      t.string :city
      t.string :state
      t.integer :bedrooms
      t.integer :bathrooms
      t.float :living_area
      t.float :land_area
      t.integer :image_count
      t.jsonb :image_urls
      t.float :avg_image_width
      t.float :avg_image_height
      t.float :lqi
      t.integer :description_length
      t.text :description
      t.string :office
      t.string :office_group_name
      t.string :office_subscription
      t.string :feed_source
      t.string :listing_url
      t.boolean :rental
      t.boolean :pre_owned
      t.boolean :outdated
      t.integer :year
      t.string :chat_gpt_conclusion
      t.float :chat_gpt_property_condition
      t.float :chat_gpt_watermark_share
      t.string :chat_gpt_watermark_text
      t.string :chat_gpt_image_quality
      t.string :chat_gpt_image_type
      t.jsonb :raw_data
      t.float :accuracy_score
      t.jsonb :accuracy_flags
      t.text :accuracy_user_message
      t.string :accuracy_action
      t.bigint :accuracy_scanned_at
      t.bigint :accuracy_source_updated_at
      t.string :moderation_status, null: false
      t.string :batch_id
      t.bigint :imported_at, null: false

      t.timestamps
    end

    add_index :listings, :je_id, unique: true
    add_index :listings, :moderation_status
    add_index :listings, :batch_id
    add_index :listings, :imported_at
    add_index :listings, :country
    add_index :listings, :feed_source
  end
end

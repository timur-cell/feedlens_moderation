class CreateMessageTemplates < ActiveRecord::Migration[8.1]
  def change
    create_table :message_templates do |t|
      t.string :name, null: false
      t.string :display_name, null: false
      t.string :category, null: false
      t.string :subject
      t.text :body, null: false
      t.boolean :is_default

      t.timestamps
    end

    add_index :message_templates, :name, unique: true
  end
end

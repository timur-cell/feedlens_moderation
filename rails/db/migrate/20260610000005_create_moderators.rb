class CreateModerators < ActiveRecord::Migration[8.1]
  def change
    create_table :moderators do |t|
      t.string :name, null: false
      t.string :email, null: false
      t.string :role, null: false, default: "moderator"
      t.string :status, null: false, default: "active"
      t.bigint :created_at_ms
      t.bigint :last_login_at
      t.string :invited_by
      t.integer :action_count

      ## Devise database_authenticatable
      t.string :encrypted_password, null: false, default: ""

      ## Devise recoverable
      t.string :reset_password_token
      t.datetime :reset_password_sent_at

      ## Devise rememberable
      t.datetime :remember_created_at

      t.timestamps
    end

    add_index :moderators, :email, unique: true
    add_index :moderators, :reset_password_token, unique: true
    add_index :moderators, :status
    add_index :moderators, :role
  end
end

class AddShadowToRules < ActiveRecord::Migration[8.1]
  def change
    # Shadow lifecycle: a shadow rule is still evaluated (to log would-have-
    # matched counts) but never contributes to a listing's outcome/action.
    add_column :rules, :shadow, :boolean, default: false, null: false
    add_column :rules, :shadow_match_count, :integer, default: 0, null: false
    add_index :rules, :shadow
  end
end

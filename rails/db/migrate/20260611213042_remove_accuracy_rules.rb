class RemoveAccuracyRules < ActiveRecord::Migration[8.1]
  # The "accuracy" rule category was disabled upstream (2026-03-17) and its
  # rules can never match: the engine excludes the category from evaluation
  # AND the evaluated listing hash never carried the accuracyFlags /
  # accuracyScore fields they condition on. The category is now removed from
  # the model validation, so purge the dead rows (13 seeded rules).
  def up
    execute("DELETE FROM rules WHERE category = 'accuracy'")
  end

  def down
    # The rules are gone from the seed catalog as well; nothing to restore.
    raise ActiveRecord::IrreversibleMigration
  end
end

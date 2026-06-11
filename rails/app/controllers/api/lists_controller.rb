module Api
  # Mirrors convex/lists.ts (reads: moderator, writes: admin), the seeding
  # mutation (convex/seedLists.ts) and the AI list suggester.
  class ListsController < BaseController
    before_action :require_admin!, only: %i[create update destroy add_item remove_item seed]

    ITEM_KEYS = %w[value type pattern flags].freeze

    # GET /api/lists
    def index
      render json: ConvexDoc.render_many(ModerationList.all)
    end

    # POST /api/lists
    def create
      items = permitted_items(params[:items])
      list = ModerationList.create!(
        name: params[:name].to_s,
        display_name: params[:displayName].to_s,
        description: params[:description],
        category: params[:category].to_s,
        source: params[:source],
        items: items,
        item_count: items.length,
        updated_at_ms: now_ms
      )
      render json: ConvexDoc.render(list)
    end

    # PATCH /api/lists/:id
    def update
      list = ModerationList.find(params[:id])
      updates = params.permit(:displayName, :description, :category).to_h.transform_keys(&:underscore)
      if params.key?(:items)
        items = permitted_items(params[:items])
        updates["items"] = items
        updates["item_count"] = items.length
      end
      updates["updated_at_ms"] = now_ms
      list.update!(updates)
      render json: ConvexDoc.render(list)
    end

    # POST /api/lists/:id/items
    def add_item
      list = ModerationList.find(params[:id])
      item = permitted_items([ params.require(:item) ]).first
      items = list.items + [ item ]
      list.update!(items: items, item_count: items.length, updated_at_ms: now_ms)
      render json: ConvexDoc.render(list)
    end

    # DELETE /api/lists/:id/items/:index
    def remove_item
      list = ModerationList.find(params[:id])
      index = params[:index].to_i
      items = list.items.each_with_index.reject { |_, i| i == index }.map(&:first)
      list.update!(items: items, item_count: items.length, updated_at_ms: now_ms)
      render json: ConvexDoc.render(list)
    end

    # DELETE /api/lists/:id
    def destroy
      ModerationList.find(params[:id]).destroy!
      render json: { success: true }
    end

    # POST /api/lists/seed — mirrors seedLists.seedAllLists: delete all
    # lists then insert the canonical set from db/seed_data/lists.json.
    def seed
      deleted = ModerationList.delete_all

      seed_lists = JSON.parse(File.read(Rails.root.join("db/seed_data/lists.json")))
      seed_lists.each do |attrs|
        ModerationList.create!(
          name: attrs.fetch("name"),
          display_name: attrs.fetch("displayName"),
          description: attrs["description"],
          category: attrs.fetch("category"),
          source: attrs["source"],
          items: attrs.fetch("items"),
          item_count: attrs.fetch("itemCount"),
          updated_at_ms: now_ms
        )
      end

      render json: { inserted: seed_lists.length, deleted: deleted }
    end

    # POST /api/lists/suggest — AI-assisted list generation
    def suggest
      render json: Ai::ListSuggester.call(description: params[:description].to_s)
    end

    private

    def permitted_items(raw)
      Array(raw).map do |item|
        hash = item.respond_to?(:to_unsafe_h) ? item.to_unsafe_h : item.to_h
        hash.stringify_keys.slice(*ITEM_KEYS)
      end
    end
  end
end

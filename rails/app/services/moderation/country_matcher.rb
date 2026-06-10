require_relative "js_compat"

# Country name <-> ISO code normalization, ported 1:1 from
# convex/moderation.ts. Rules use ISO codes (ES, IT, PT) while listing data
# often carries full names (Spain, Italy) or even region names (Algarve).
module Moderation
  module CountryMatcher
    module_function

    # Regions JE sometimes uses instead of country names in humanized_location.
    REGION_TO_COUNTRY_CODE = {
      "algarve" => "PT", "lisbon" => "PT", "madeira" => "PT", "azores" => "PT", "porto" => "PT",
      "balearic islands" => "ES", "andalusia" => "ES", "catalonia" => "ES", "canary islands" => "ES",
      "valencia" => "ES", "galicia" => "ES", "basque country" => "ES", "castile and león" => "ES",
      "tuscany" => "IT", "sardinia" => "IT", "sicily" => "IT", "lombardy" => "IT", "lazio" => "IT",
      "puglia" => "IT", "apulia" => "IT", "liguria" => "IT", "umbria" => "IT", "veneto" => "IT",
      "campania" => "IT", "emilia-romagna" => "IT", "piedmont" => "IT", "calabria" => "IT",
      "provence-alpes-côte d'azur" => "FR", "île-de-france" => "FR", "occitanie" => "FR",
      "nouvelle-aquitaine" => "FR", "brittany" => "FR", "normandy" => "FR", "corsica" => "FR",
      "crete" => "GR", "peloponnese" => "GR", "attica" => "GR", "thessaly" => "GR",
      "macedonia and thrace" => "GR", "cyclades" => "GR", "dodecanese" => "GR", "ionian islands" => "GR",
      "dubai" => "AE", "abu dhabi" => "AE", "sharjah" => "AE",
      "bavaria" => "DE", "scotland" => "GB", "england" => "GB", "wales" => "GB",
      "queensland" => "AU", "new south wales" => "AU", "victoria" => "AU",
      "florida" => "US", "california" => "US", "new york" => "US", "texas" => "US"
    }.freeze

    # Full name -> ISO code (lowercase keys for case-insensitive matching).
    COUNTRY_NAME_TO_CODE = {
      "spain" => "ES", "italy" => "IT", "portugal" => "PT", "france" => "FR", "greece" => "GR",
      "united states" => "US", "usa" => "US", "united kingdom" => "GB", "uk" => "GB",
      "germany" => "DE", "austria" => "AT", "switzerland" => "CH", "netherlands" => "NL",
      "belgium" => "BE", "sweden" => "SE", "norway" => "NO", "denmark" => "DK", "finland" => "FI",
      "ireland" => "IE", "croatia" => "HR", "turkey" => "TR", "cyprus" => "CY", "malta" => "MT",
      "monaco" => "MC", "luxembourg" => "LU", "andorra" => "AD", "montenegro" => "ME",
      "united arab emirates" => "AE", "uae" => "AE", "saudi arabia" => "SA", "qatar" => "QA",
      "bahrain" => "BH", "oman" => "OM", "kuwait" => "KW", "thailand" => "TH", "indonesia" => "ID",
      "malaysia" => "MY", "singapore" => "SG", "philippines" => "PH", "japan" => "JP",
      "australia" => "AU", "new zealand" => "NZ", "canada" => "CA", "mexico" => "MX",
      "brazil" => "BR", "argentina" => "AR", "colombia" => "CO", "chile" => "CL",
      "south africa" => "ZA", "morocco" => "MA", "egypt" => "EG", "kenya" => "KE",
      "russia" => "RU", "china" => "CN", "india" => "IN", "israel" => "IL",
      "czech republic" => "CZ", "czechia" => "CZ", "poland" => "PL", "hungary" => "HU",
      "romania" => "RO", "bulgaria" => "BG", "slovakia" => "SK", "slovenia" => "SI",
      "estonia" => "EE", "latvia" => "LV", "lithuania" => "LT",
      "st. martin" => "MF", "saint martin" => "MF", "sint maarten" => "SX",
      "barbados" => "BB", "bahamas" => "BS", "jamaica" => "JM", "costa rica" => "CR",
      "panama" => "PA", "dominican republic" => "DO", "puerto rico" => "PR",
      "cayman islands" => "KY", "turks and caicos" => "TC"
    }.freeze

    # Reverse map (code -> canonical name); first name wins, same as the TS
    # loop that only assigns when the code is not yet present.
    COUNTRY_CODE_TO_NAME = COUNTRY_NAME_TO_CODE.each_with_object({}) do |(name, code), map|
      map[code] ||= name
    end.freeze

    # "UK" is a common alias for the ISO code "GB" — normalize so filters
    # using either spelling match listings using the other.
    def normalize_code(code)
      uc = code.upcase
      uc == "UK" ? "GB" : uc
    end

    # Best-effort country -> ISO code normalization (TS export toCountryCode).
    def to_country_code(country)
      trimmed = (JsCompat.js_truthy?(country) ? country : "").strip
      return "" if trimmed.empty?
      return normalize_code(trimmed) if trimmed.length <= 3
      lower = trimmed.downcase
      COUNTRY_NAME_TO_CODE[lower] || REGION_TO_COUNTRY_CODE[lower] || trimmed.upcase
    end

    # Check if a listing's country matches a countryFilter array (TS
    # countryMatches). Handles ISO codes, full names and region names.
    def matches?(listing_country, filter_values)
      return false if JsCompat.js_falsy?(listing_country)
      lc = listing_country.strip
      lc_lower = lc.downcase

      # Direct match (exact or case-insensitive)
      return true if filter_values.any? { |f| f.downcase == lc_lower || f == lc }

      # Listing has full name -> normalize to code and check
      code = COUNTRY_NAME_TO_CODE[lc_lower]
      return true if code && filter_values.any? { |f| normalize_code(f) == code }

      # Listing has code -> check against full names in filter
      uc_lc = lc.upcase
      if uc_lc.length <= 3
        canonical_name = COUNTRY_CODE_TO_NAME[normalize_code(uc_lc)]
        return true if canonical_name && filter_values.any? { |f| f.downcase == canonical_name }
        return true if filter_values.any? { |f| normalize_code(f) == normalize_code(uc_lc) }
      end

      # Region fallback: "Algarve" -> PT, "Balearic Islands" -> ES, etc.
      region_code = REGION_TO_COUNTRY_CODE[lc_lower]
      return true if region_code && filter_values.any? { |f| normalize_code(f) == region_code }

      false
    end
  end
end

# JavaScript semantics helpers used by the moderation rule engine.
#
# The engine is a 1:1 port of convex/moderation.ts and must reproduce its
# JavaScript coercion behaviour exactly: Number()/NaN arithmetic, String()
# formatting (String(5.0) === "5"), the JS falsy set (false, 0, NaN, "",
# null, undefined) and JS RegExp anchoring. Pure Ruby, no Rails dependency.
module Moderation
  module JsCompat
    module_function

    # JS whitespace trimmed by Number(string): ASCII whitespace plus NBSP,
    # line/paragraph separators and the BOM.
    JS_TRIM = /\A[\s   ﻿]+|[\s   ﻿]+\z/

    # JS Number(value).
    #
    # Note on nil: JS distinguishes Number(undefined) => NaN from
    # Number(null) => 0. Ruby has only nil; we map nil to NaN because in the
    # ported code paths a nil only ever reaches Number() when a config key is
    # absent (undefined in JS). JSON nulls never reach numeric coercion in
    # the seed data or fixtures.
    def js_number(value)
      case value
      when nil then Float::NAN
      when true then 1.0
      when false then 0.0
      when Numeric then value.to_f
      when String then js_number_from_string(value)
      when Array
        case value.length
        when 0 then 0.0
        when 1 then js_number(value.first)
        else Float::NAN
        end
      else Float::NAN
      end
    end

    def js_number_from_string(str)
      s = str.gsub(JS_TRIM, "")
      return 0.0 if s.empty?
      case s
      when /\A[+-]?Infinity\z/ then s.start_with?("-") ? -Float::INFINITY : Float::INFINITY
      when /\A0[xX]\h+\z/ then s.to_i(16).to_f
      when /\A0[bB][01]+\z/ then s.to_i(2).to_f
      when /\A0[oO][0-7]+\z/ then s.to_i(8).to_f
      when /\A[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?\z/ then s.to_f
      else Float::NAN
      end
    end

    # JS String(value).
    #
    # Note on nil: JS String(undefined) => "undefined" and String(null) =>
    # "null". We map nil to "undefined" (missing key semantics) — the only
    # way a nil reaches String() in the ported code is an absent config key.
    def js_string(value)
      case value
      when nil then "undefined"
      when true then "true"
      when false then "false"
      when Float then js_string_from_float(value)
      when String then value
      when Array then value.map { |v| v.nil? ? "" : js_string(v) }.join(",")
      when Hash then "[object Object]"
      else value.to_s
      end
    end

    def js_string_from_float(value)
      return "NaN" if value.nan?
      return value.positive? ? "Infinity" : "-Infinity" if value.infinite?
      if value == value.to_i && value.abs < 1e21
        value.to_i.to_s
      else
        value.to_s
      end
    end

    # JS truthiness: everything is truthy except false, 0, NaN, "", null and
    # undefined. Note that [] and {} are truthy in JS (unlike e.g. Python).
    def js_truthy?(value)
      return false if value.nil? || value == false
      return false if value.is_a?(Float) && value.nan?
      return false if value.is_a?(Numeric) && value.zero?
      return false if value.is_a?(String) && value.empty?
      true
    end

    def js_falsy?(value)
      !js_truthy?(value)
    end

    # JS `a || b || ... || z`: first truthy operand, else the last operand.
    def js_or(*values)
      values.find { |v| js_truthy?(v) } || values.last
    end

    # JS `new RegExp(source, "i")`. Raises RegexpError for invalid sources so
    # callers can mirror the TS try/catch behaviour.
    def js_regexp(source)
      Regexp.new(translate_js_regexp_source(js_string(source)), Regexp::IGNORECASE)
    end

    # Translate JS regexp source quirks to Ruby: in JS (without the /m flag,
    # which the engine never uses) unescaped ^ and $ outside character
    # classes anchor the whole string, while in Ruby they anchor each line —
    # so they become \A and \z.
    def translate_js_regexp_source(source)
      out = +""
      in_class = false
      escaped = false
      source.each_char do |ch|
        if escaped
          out << ch
          escaped = false
          next
        end
        case ch
        when "\\"
          out << ch
          escaped = true
        when "["
          in_class = true
          out << ch
        when "]"
          in_class = false
          out << ch
        when "^"
          out << (in_class ? ch : "\\A")
        when "$"
          out << (in_class ? ch : "\\z")
        else
          out << ch
        end
      end
      out
    end
  end
end

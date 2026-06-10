# Temporarily set/unset ENV variables for the duration of a block.
module EnvHelpers
  def with_env(values)
    previous = {}
    values.each do |key, value|
      previous[key] = ENV[key]
      value.nil? ? ENV.delete(key) : ENV[key] = value
    end
    yield
  ensure
    previous.each do |key, value|
      value.nil? ? ENV.delete(key) : ENV[key] = value
    end
  end
end

RSpec.configure do |config|
  config.include EnvHelpers
end

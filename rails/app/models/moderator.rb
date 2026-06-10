class Moderator < ApplicationRecord
  ROLES = %w[admin moderator viewer].freeze
  STATUSES = %w[active invited disabled].freeze

  devise :database_authenticatable, :recoverable, :rememberable, :validatable

  has_many :moderator_activities, dependent: :destroy

  before_validation :normalize_email
  before_create :set_created_at_ms

  validates :name, presence: true
  validates :role, inclusion: { in: ROLES }
  validates :status, inclusion: { in: STATUSES }

  def active?
    status == "active"
  end

  def admin?
    role == "admin"
  end

  private

  def normalize_email
    self.email = email.to_s.strip.downcase
  end

  def set_created_at_ms
    self.created_at_ms ||= (Time.current.to_f * 1000).to_i
  end
end

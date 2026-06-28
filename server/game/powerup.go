package game

import "time"

// PowerupType identifies a timed buff. The value is sent to the client so it
// can show the matching icon / glow.
type PowerupType byte

const (
	PowerupOverdrive   PowerupType = 0 // +50% power generation
	PowerupWarCry      PowerupType = 1 // +30% unit bullet damage
	PowerupBulwark     PowerupType = 2 // temporary invulnerability
	PowerupRepairSurge PowerupType = 3 // instant full base heal (no duration)
)

// Multipliers / tuning for powerup effects.
const (
	OverdrivePowerMultiplier = 1.5
	WarCryDamageMultiplier   = 1.3
)

// ShopItem is one purchasable entry. Cost is in Power. DurationMs is the buff
// length in milliseconds (0 for instant effects).
type ShopItem struct {
	Powerup    PowerupType
	Cost       uint16
	DurationMs uint16
}

// ShopItems is the authoritative catalog, keyed by the item ID the client
// sends in a buy message. The client keeps a matching display list.
var ShopItems = map[byte]ShopItem{
	0: {Powerup: PowerupOverdrive, Cost: 3000, DurationMs: 30000},
	1: {Powerup: PowerupWarCry, Cost: 4000, DurationMs: 20000},
	2: {Powerup: PowerupBulwark, Cost: 5000, DurationMs: 10000},
	3: {Powerup: PowerupRepairSurge, Cost: 6000, DurationMs: 0},
}

// --- Overdrive ---

func (p *Player) ActivateOverdrive(d time.Duration) {
	p.Lock()
	p.OverdriveEndTime = time.Now().Add(d)
	p.Unlock()
}

func (p *Player) HasOverdrive() bool {
	p.RLock()
	defer p.RUnlock()
	return time.Now().Before(p.OverdriveEndTime)
}

// --- War Cry ---

func (p *Player) ActivateWarCry(d time.Duration) {
	p.Lock()
	p.WarCryEndTime = time.Now().Add(d)
	p.Unlock()
}

func (p *Player) HasWarCry() bool {
	p.RLock()
	defer p.RUnlock()
	return time.Now().Before(p.WarCryEndTime)
}

// DamageScale returns the bullet damage multiplier for this player's units.
func (p *Player) DamageScale() float32 {
	if p.HasWarCry() {
		return WarCryDamageMultiplier
	}
	return 1.0
}

// --- Bulwark ---

// ActivateBulwark grants temporary invulnerability. It is a separate field
// from spawn protection so it is not cancelled when the player's units leave
// their base, but the combat loop treats it the same way for damage purposes.
func (p *Player) ActivateBulwark(d time.Duration) {
	p.Lock()
	p.BulwarkEndTime = time.Now().Add(d)
	p.Unlock()
}

func (p *Player) HasBulwark() bool {
	p.RLock()
	defer p.RUnlock()
	return time.Now().Before(p.BulwarkEndTime)
}

// IsInvulnerable reports whether the player currently cannot be damaged, from
// either spawn protection or an active Bulwark powerup.
func (p *Player) IsInvulnerable() bool {
	return p.HasProtection() || p.HasBulwark()
}

// applyWarCry boosts a freshly-created unit bullet's damage while the owner has
// the War Cry powerup active. Bullet damage is derived from its Health, so we
// scale Health directly (above its Max, which is fine for a transient bullet).
func applyWarCry(player *Player, bullet *Bullet) {
	if bullet == nil || !player.HasWarCry() {
		return
	}
	bullet.Health.Lock()
	bullet.Health.Current = uint16(float32(bullet.Health.Current) * WarCryDamageMultiplier)
	bullet.Health.Unlock()
}

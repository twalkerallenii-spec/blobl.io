import { ShopItems, PowerupTypes } from "../../network/constants.js";

/**
 * ShopManager renders the in-game shop panel, sends buy requests, and shows
 * active powerups (HUD chips with countdowns). The server is authoritative for
 * costs and effects; this is purely presentation + input.
 */
export default class ShopManager {
    constructor (core) {
        this.core = core;
        this.open = false;
        this._visible = false;
        this.active = new Map(); // powerupType -> { el, endTime, durationMs, fill, time }

        this.button = document.getElementById("shop-button");
        this.panel = document.getElementById("shop-container");
        this.listEl = document.getElementById("shop-list");
        this.exitButton = document.getElementById("shop-container-exit");
        this.hud = document.getElementById("powerup-hud");

        this._buildItems();
        this._wireEvents();
        this.setVisible(false);

        // Drive HUD countdowns.
        setInterval(() => this._tick(), 200);
    }

    _buildItems () {
        if (!this.listEl) return;
        this.listEl.innerHTML = "";
        ShopItems.forEach(item => {
            const el = document.createElement("div");
            el.className = "shop-item";
            const dur = item.durationMs > 0 ? `${Math.round(item.durationMs / 1000)}s` : "instant";
            el.innerHTML =
                `<div class="shop-item-icon">${item.icon}</div>` +
                `<div class="shop-item-info">` +
                    `<div class="shop-item-name">${item.name}</div>` +
                    `<div class="shop-item-desc">${item.description}</div>` +
                `</div>` +
                `<div class="shop-item-meta">` +
                    `<div class="shop-item-cost">${item.cost} ⚡</div>` +
                    `<div class="shop-item-dur">${dur}</div>` +
                `</div>`;
            el.addEventListener("click", () => this.buy(item));
            item._el = el;
            this.listEl.appendChild(el);
        });
    }

    _wireEvents () {
        if (this.button) this.button.addEventListener("click", () => this.toggle());
        if (this.exitButton) this.exitButton.addEventListener("click", () => this.setOpen(false));

        document.addEventListener("keydown", (e) => {
            if (e.repeat || !this._visible) return;
            if (this.core.uiManager && this.core.uiManager.isChatInputFocused) return;
            const tag = (document.activeElement && document.activeElement.tagName) || "";
            if (tag === "INPUT" || tag === "TEXTAREA") return;
            if (e.key === "b" || e.key === "B") this.toggle();
            else if (e.key === "Escape" && this.open) this.setOpen(false);
        });
    }

    // Toggle the shop button / HUD with game state (called from UIManager).
    setVisible (show) {
        this._visible = show;
        if (this.button) this.button.style.display = show ? "flex" : "none";
        if (this.hud) this.hud.style.display = show ? "flex" : "none";
        if (!show) {
            this.setOpen(false);
            this._clearAll();
        }
    }

    toggle () { this.setOpen(!this.open); }

    setOpen (open) {
        this.open = open;
        if (this.panel) this.panel.style.display = open ? "block" : "none";
        if (open) this._refreshAffordability();
    }

    _refreshAffordability () {
        const power = this.core.gameManager.resources.power.current;
        ShopItems.forEach(item => {
            if (item._el) item._el.classList.toggle("unaffordable", power < item.cost);
        });
    }

    buy (item) {
        const power = this.core.gameManager.resources.power.current;
        if (power < item.cost) {
            if (item._el) {
                item._el.classList.add("denied");
                setTimeout(() => item._el.classList.remove("denied"), 400);
            }
            return;
        }
        this.core.networkManager.buyShopItem(item.id);
    }

    // Called when the server confirms any player's powerup activation.
    onPowerupActivated (player, powerupType, durationMs) {
        // Bulwark reuses the spawn-protection shield ring so all clients see it.
        if (powerupType === PowerupTypes.BULWARK) {
            player.hasSpawnProtection = true;
            if (this.core.renderer && this.core.renderer.updatePlayerConnections) {
                this.core.renderer.updatePlayerConnections();
            }
            if (durationMs > 0) {
                setTimeout(() => {
                    player.removeSpawnProtection();
                    if (this.core.renderer && this.core.renderer.updatePlayerConnections) {
                        this.core.renderer.updatePlayerConnections();
                    }
                }, durationMs);
            }
        }

        // Only the local player gets HUD chips.
        if (!player.isClient) return;
        const item = ShopItems.find(i => i.powerup === powerupType);
        if (!item) return;

        if (durationMs > 0) this._addOrRefreshChip(item, durationMs);
        else this._instantChip(item);
    }

    _addOrRefreshChip (item, durationMs) {
        if (!this.hud) return;
        const endTime = performance.now() + durationMs;
        let entry = this.active.get(item.powerup);
        if (!entry) {
            const el = document.createElement("div");
            el.className = "powerup-chip";
            el.innerHTML =
                `<span class="pc-icon">${item.icon}</span>` +
                `<span class="pc-name">${item.name}</span>` +
                `<span class="pc-time"></span>` +
                `<div class="pc-bar"><div class="pc-bar-fill"></div></div>`;
            this.hud.appendChild(el);
            entry = { el, fill: el.querySelector(".pc-bar-fill"), time: el.querySelector(".pc-time") };
            this.active.set(item.powerup, entry);
        }
        entry.endTime = endTime;
        entry.durationMs = durationMs;
    }

    _instantChip (item) {
        if (!this.hud) return;
        const el = document.createElement("div");
        el.className = "powerup-chip instant";
        el.innerHTML = `<span class="pc-icon">${item.icon}</span><span class="pc-name">${item.name}</span>`;
        this.hud.appendChild(el);
        setTimeout(() => el.remove(), 1500);
    }

    _tick () {
        const now = performance.now();
        for (const [type, entry] of this.active) {
            const remaining = entry.endTime - now;
            if (remaining <= 0) {
                entry.el.remove();
                this.active.delete(type);
                continue;
            }
            const pct = Math.max(0, Math.min(1, remaining / entry.durationMs));
            if (entry.fill) entry.fill.style.width = `${pct * 100}%`;
            if (entry.time) entry.time.textContent = `${Math.ceil(remaining / 1000)}s`;
        }
        if (this.open) this._refreshAffordability();
    }

    _clearAll () {
        for (const [, entry] of this.active) entry.el.remove();
        this.active.clear();
    }
}

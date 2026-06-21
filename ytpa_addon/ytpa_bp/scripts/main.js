import { world, system } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

const AFFECTION_KEY = "ytpa:affection";
const MAX_AFFECTION = 100;
const uiCooldown = new Map();
const activeCarts = new Map();

function getAffection(entity) {
    return entity.getDynamicProperty(AFFECTION_KEY) || 0;
}

function setAffection(entity, value) {
    entity.setDynamicProperty(AFFECTION_KEY, Math.min(value, MAX_AFFECTION));
}

function getHealth(entity) {
    const health = entity.getComponent("minecraft:health");
    if (!health) return { current: 20, max: 20 };
    return { current: Math.floor(health.currentValue), max: Math.floor(health.effectiveMax) };
}

world.afterEvents.entitySpawn.subscribe((event) => {
    const entity = event.entity;
    if (entity.typeId === "ytpa:dummy") {
        if (entity.getDynamicProperty(AFFECTION_KEY) === undefined) {
            entity.setDynamicProperty(AFFECTION_KEY, 0);
        }
    }
});

async function showDummyUI(player, dummy) {
    const affection = getAffection(dummy);
    const hp = getHealth(dummy);

    const fullHearts = Math.floor(hp.current / 2);
    const halfHeart = hp.current % 2;
    const emptyHearts = Math.floor((hp.max - hp.current) / 2);

    let heartsText = "";
    for (let i = 0; i < fullHearts; i++) heartsText += "\uE10A";
    if (halfHeart) heartsText += "\uE10B";
    for (let i = 0; i < emptyHearts; i++) heartsText += "\uE10C";

    const affectionSegments = Math.floor(affection / 10);
    let affectionBar = "";
    for (let i = 0; i < 10; i++) {
        affectionBar += i < affectionSegments ? "\uE10D" : "\uE10E";
    }

    const form = new ActionFormData()
        .title("§l§dYour Stupid Character")
        .body(`§r${heartsText}\n§cHP: ${hp.current}/${hp.max}\n\n§d${affectionBar}\n§7Afeto: ${affection}/${MAX_AFFECTION}`)
        .button("§l§d♥ Interagir", "textures/items/cake")
        .button("§l§7📦 Inventário", "textures/items/chest_minecart")
        .button("§l§c✕ Fechar", "textures/ui/cancel");

    const response = await form.show(player);
    if (response.canceled) return;

    switch (response.selection) {
        case 0:
            const newAffection = Math.min(getAffection(dummy) + 5, MAX_AFFECTION);
            setAffection(dummy, newAffection);
            player.sendMessage(`§d♥ Afeto: ${newAffection}/${MAX_AFFECTION}`);
            break;
        case 1:
            openChestMinecartInventory(player, dummy);
            break;
        case 2:
            break;
    }
}

function openChestMinecartInventory(player, dummy) {
    cleanupCart(player);

    const pos = dummy.location;
    const dim = world.getDimension("overworld");
    const cx = Math.floor(pos.x);
    const cy = Math.floor(pos.y);
    const cz = Math.floor(pos.z);

    try {
        dim.runCommand(`summon chest_minecart ${cx} ${cy} ${cz}`);
    } catch (e) {
        player.sendMessage("§cErro ao spawnar minecart.");
        return;
    }

    system.runTimeout(() => {
        const carts = dim.getEntities({
            type: "chest_minecart",
            location: { x: cx, y: cy, z: cz },
            maxDistance: 3
        });

        if (carts.length === 0) {
            player.sendMessage("§cMinecart não encontrado.");
            return;
        }

        const cart = carts[0];

        // Copy dummy inventory to minecart
        const dummyContainer = dummy.getComponent("minecraft:inventory")?.container;
        const cartContainer = cart.getComponent("minecraft:inventory")?.container;

        if (dummyContainer && cartContainer) {
            const slotCount = Math.min(dummyContainer.size, cartContainer.size);
            for (let i = 0; i < slotCount; i++) {
                const item = dummyContainer.getItem(i);
                if (item) {
                    try {
                        cartContainer.setItem(i, item.clone());
                    } catch (e) {}
                }
            }
        }

        // Teleport player ON TOP of minecart and force ride
        player.teleport({ x: cx + 0.5, y: cy + 0.5, z: cz + 0.5 });

        // Force player to ride the minecart (opens inventory automatically)
        system.runTimeout(() => {
            try {
                player.runCommandAsync(`ride @s start_riding @e[type=chest_minecart,c=1,r=2]`);
            } catch (e) {
                // If ride fails, player can click manually
                player.sendMessage("§7Clique no minecart para abrir.");
            }
        }, 2);

        // Monitor until player dismounts
        const intervalId = system.runInterval(() => {
            try {
                const riding = player.getComponent("minecraft:riding");
                const isRiding = riding && riding.entityRidingOn;

                if (!isRiding) {
                    // Player dismounted - save items back
                    saveCartToDummy(cart, dummy);
                    cart.remove();
                    activeCarts.delete(player.id);
                    system.clearRun(intervalId);
                }

                if (!cart.isValid) {
                    activeCarts.delete(player.id);
                    system.clearRun(intervalId);
                }
            } catch (e) {
                saveCartToDummy(cart, dummy);
                try { cart.remove(); } catch (e2) {}
                activeCarts.delete(player.id);
                system.clearRun(intervalId);
            }
        }, 5);

        // Max timeout 60 seconds
        system.runTimeout(() => {
            if (activeCarts.has(player.id)) {
                const data = activeCarts.get(player.id);
                if (data) {
                    system.clearRun(data.intervalId);
                    try { 
                        saveCartToDummy(cart, dummy);
                        cart.remove(); 
                    } catch (e) {}
                }
                activeCarts.delete(player.id);
            }
        }, 1200);

        activeCarts.set(player.id, { cartId: cart.id, dummyId: dummy.id, intervalId: intervalId });

    }, 5);
}

function saveCartToDummy(cart, dummy) {
    const dummyContainer = dummy.getComponent("minecraft:inventory")?.container;
    const cartContainer = cart.getComponent("minecraft:inventory")?.container;

    if (dummyContainer && cartContainer) {
        const slotCount = Math.min(dummyContainer.size, cartContainer.size);
        for (let i = 0; i < slotCount; i++) {
            const item = cartContainer.getItem(i);
            if (item) {
                dummyContainer.setItem(i, item.clone());
            } else {
                dummyContainer.setItem(i, undefined);
            }
        }
    }
}

function cleanupCart(player) {
    const data = activeCarts.get(player.id);
    if (data) {
        try {
            system.clearRun(data.intervalId);
            const dim = world.getDimension("overworld");
            const carts = dim.getEntities({ type: "chest_minecart" });
            for (const cart of carts) {
                if (cart.id === data.cartId) {
                    // Find the dummy
                    const dummies = dim.getEntities({ type: "ytpa:dummy" });
                    for (const d of dummies) {
                        if (d.id === data.dummyId) {
                            saveCartToDummy(cart, d);
                            break;
                        }
                    }
                    cart.remove();
                    break;
                }
            }
        } catch (e) {}
        activeCarts.delete(player.id);
    }
}

world.beforeEvents.playerInteractWithEntity.subscribe((event) => {
    const target = event.target;
    if (!target) return;
    if (target.typeId !== "ytpa:dummy") return;

    const player = event.player;
    if (!player) return;

    const item = event.itemStack;

    if (item && item.typeId === "minecraft:cake") {
        const affection = getAffection(target);
        const newAffection = Math.min(affection + 10, MAX_AFFECTION);
        setAffection(target, newAffection);
        player.sendMessage(`§d♥ Afeto: ${newAffection}/${MAX_AFFECTION}`);
        return;
    }

    event.cancel = true;

    const now = Date.now();
    const lastClick = uiCooldown.get(player.id) || 0;
    if (now - lastClick < 500) return;
    uiCooldown.set(player.id, now);

    system.runTimeout(() => showDummyUI(player, target), 1);
});

// Armor sync
system.runInterval(() => {
    for (const entity of world.getDimension("overworld").getEntities({ type: "ytpa:dummy" })) {
        const container = entity.getComponent("minecraft:inventory")?.container;
        if (!container) continue;

        const armorMap = {
            0: "slot.armor.head",
            1: "slot.armor.chest", 
            2: "slot.armor.legs",
            3: "slot.armor.feet"
        };

        for (let slot = 0; slot < 4; slot++) {
            const item = container.getItem(slot);
            if (item) {
                const itemId = item.typeId;
                const isArmor = itemId.includes("helmet") || itemId.includes("chestplate") || 
                               itemId.includes("leggings") || itemId.includes("boots") ||
                               itemId.includes("carved_pumpkin") || itemId.includes("turtle_helmet") ||
                               itemId.includes("skull") || itemId.includes("head");

                if (isArmor) {
                    try {
                        entity.runCommandAsync(`replaceitem entity @s ${armorMap[slot]} 0 ${itemId}`);
                    } catch (e) {}
                }
            }
        }
    }
}, 5);

console.info("[Dummy Addon] Script loaded successfully!");

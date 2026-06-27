import { world, system } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import "./javascript/wardrobe.js";

const AFFECTION_KEY = "ytpa:affection";
const MAX_AFFECTION = 100;

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
            player.sendMessage("§eInventário do dummy em breve...");
            break;
        case 2:
            break;
    }
}

world.afterEvents.entityHitEntity.subscribe((event) => {
    const player = event.damagingEntity;
    const target = event.hitEntity;
    if (!player || player.typeId !== "minecraft:player") return;
    if (target.typeId === "ytpa:dummy") {
        showDummyUI(player, target);
    }
});

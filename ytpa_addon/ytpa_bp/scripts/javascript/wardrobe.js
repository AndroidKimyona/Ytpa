import { world, system } from "@minecraft/server";

const DRAWER_OFFSETS = {
    BIG:   { x: 0,     y: 0.5,  z: 0 },
    LEFT:  { x: -0.5,  y: -0.5, z: 0 },
    RIGHT: { x: 0.5,   y: -0.5, z: 0 }
};

function rotateOffset(x, z, yawDeg) {
    const yaw = (yawDeg * Math.PI) / 180;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    return { x: x * cos - z * sin, z: x * sin + z * cos };
}

function spawnDrawer(wardrobe, type) {
    const dim = wardrobe.dimension;
    const pos = wardrobe.location;
    const yaw = wardrobe.getRotation().y;
    const off = rotateOffset(DRAWER_OFFSETS[type].x, DRAWER_OFFSETS[type].z, yaw);
    
    const drawer = dim.spawnEntity(`ytpa:wardrobe_drawer_${type.toLowerCase()}`, {
        x: pos.x + off.x,
        y: pos.y + DRAWER_OFFSETS[type].y,
        z: pos.z + off.z
    });
    
    drawer.setDynamicProperty("ytpa:parent_uuid", wardrobe.id);
    drawer.setRotation({ x: 0, y: yaw });
    
    const existing = wardrobe.getDynamicProperty("ytpa:drawer_ids") || "";
    wardrobe.setDynamicProperty("ytpa:drawer_ids", existing + "," + drawer.id);
}

world.afterEvents.entitySpawn.subscribe((event) => {
    const entity = event.entity;
    if (entity.typeId !== "ytpa:wardrobe") return;
    
    system.runTimeout(() => {
        spawnDrawer(entity, "BIG");
        spawnDrawer(entity, "LEFT");
        spawnDrawer(entity, "RIGHT");
    }, 2);
});

function getHammer(player) {
    try {
        const equippable = player.getComponent("minecraft:equippable");
        return equippable?.getEquipment("Mainhand");
    } catch { return undefined; }
}

function getParentWardrobe(drawer) {
    const parentId = drawer.getDynamicProperty("ytpa:parent_uuid");
    if (!parentId) return null;
    const entity = world.getEntity(parentId);
    return (entity && entity.isValid()) ? entity : null;
}

function dropInventory(entity, pos) {
    const container = entity.getComponent("minecraft:inventory")?.container;
    if (!container) return;
    const dim = entity.dimension;
    for (let i = 0; i < container.size; i++) {
        const item = container.getItem(i);
        if (item) dim.spawnItem(item, pos);
    }
}

function breakWardrobe(wardrobe) {
    const dim = wardrobe.dimension;
    const pos = wardrobe.location;
    
    const drawerIds = (wardrobe.getDynamicProperty("ytpa:drawer_ids") || "").split(",").filter(id => id);
    for (const id of drawerIds) {
        try {
            const drawer = world.getEntity(id);
            if (drawer && drawer.isValid()) {
                dropInventory(drawer, pos);
                drawer.kill();
            }
        } catch {}
    }
    
    wardrobe.kill();
}

// Só martelo agora. Inventário é nativo via container_type.
try {
    world.afterEvents.entityHitEntity.subscribe((event) => {
        const attacker = event.damagingEntity;
        const target = event.hitEntity;
        
        if (!attacker || attacker.typeId !== "minecraft:player") return;
        
        const isWardrobe = target.typeId === "ytpa:wardrobe";
        const isDrawer = target.typeId.startsWith("ytpa:wardrobe_drawer_");
        if (!isWardrobe && !isDrawer) return;
        
        const hammer = getHammer(attacker);
        if (hammer?.typeId === "ytpa:hammer") {
            const wardrobe = isWardrobe ? target : getParentWardrobe(target);
            if (wardrobe) breakWardrobe(wardrobe);
        }
    });
} catch (e) {
    world.afterEvents.entityHurt.subscribe((event) => {
        const attacker = event.damageSource.damagingEntity;
        const target = event.hurtEntity;
        
        if (!attacker || attacker.typeId !== "minecraft:player") return;
        
        const isWardrobe = target.typeId === "ytpa:wardrobe";
        const isDrawer = target.typeId.startsWith("ytpa:wardrobe_drawer_");
        if (!isWardrobe && !isDrawer) return;
        
        const hammer = getHammer(attacker);
        if (hammer?.typeId === "ytpa:hammer") {
            const wardrobe = isWardrobe ? target : getParentWardrobe(target);
            if (wardrobe) breakWardrobe(wardrobe);
        }
    });
}
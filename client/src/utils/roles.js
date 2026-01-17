// src/utils/roles.js
export const isAdmin = (u) => u?.role === "admin";
export const isMiniAdmin = (u) => u?.role === "mini_admin";
export const isStaff = (u) => isAdmin(u) || isMiniAdmin(u);

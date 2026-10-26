// Solo para la vista previa web de desarrollo (pruebas y capturas): no hay llavero en el navegador,
// así que la sesión vive en sessionStorage y se pierde al cerrar la pestaña. Las apps de iOS y Android
// usan secureStore.ts.
export const secureStore = {
  get: async (key: string) => sessionStorage.getItem(key),
  set: async (key: string, value: string) => sessionStorage.setItem(key, value),
  remove: async (key: string) => sessionStorage.removeItem(key),
};

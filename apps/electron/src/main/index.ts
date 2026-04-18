import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import { createDataService, type DataService } from "@edv4h/poke-mate-data-service";
import {
  IPC,
  type GetPokemonDetailsRequest,
  type SearchPokemonRequest,
} from "@edv4h/poke-mate-shared-types";
import { resolveDbPath } from "./db-path.js";

let dataService: DataService | null = null;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env["ELECTRON_RENDERER_URL"]) {
    void win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"));
  }
  return win;
}

function registerIpc(service: DataService): void {
  ipcMain.handle(IPC.SEARCH_POKEMON, (_e, req: SearchPokemonRequest) => {
    return service.searchPokemon(req);
  });
  ipcMain.handle(IPC.GET_POKEMON_DETAILS, (_e, req: GetPokemonDetailsRequest) => {
    return service.getPokemonDetails(req.speciesId);
  });
}

app.whenReady().then(() => {
  dataService = createDataService({ dbPath: resolveDbPath(), actor: "gui" });
  registerIpc(dataService);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  dataService?.close();
  dataService = null;
});

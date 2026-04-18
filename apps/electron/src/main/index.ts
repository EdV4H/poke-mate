import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import { createDataService, type DataService } from "@edv4h/poke-mate-data-service";
import {
  IPC,
  type ChangeEventPush,
  type ChangeEventsSinceRequest,
  type CreatePartyRequest,
  type DeletePartyRequest,
  type DeletePartySlotRequest,
  type GetPartyRequest,
  type GetPokemonDetailsRequest,
  type ListPartiesRequest,
  type SearchPokemonRequest,
  type UpdatePartyRequest,
  type UpsertPartySlotRequest,
} from "@edv4h/poke-mate-shared-types";
import { resolveDbPath } from "./db-path.js";

const ACTOR = "gui" as const;

let dataService: DataService | null = null;
let mainWindow: BrowserWindow | null = null;
let unsubscribeBus: (() => void) | null = null;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
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
  ipcMain.handle(IPC.SEARCH_POKEMON, (_e, req: SearchPokemonRequest) =>
    service.searchPokemon(req),
  );
  ipcMain.handle(IPC.GET_POKEMON_DETAILS, (_e, req: GetPokemonDetailsRequest) =>
    service.getPokemonDetails(req.speciesId),
  );

  ipcMain.handle(IPC.LIST_PARTIES, (_e, req: ListPartiesRequest) =>
    service.party.listParties(req.workspaceId),
  );
  ipcMain.handle(IPC.GET_PARTY, (_e, req: GetPartyRequest) =>
    service.party.getParty(req.partyId),
  );
  ipcMain.handle(IPC.CREATE_PARTY, (_e, req: CreatePartyRequest) => {
    const result = service.party.createParty(req, ACTOR);
    return { ...result.value, changeEventId: result.changeEventId };
  });
  ipcMain.handle(IPC.UPDATE_PARTY, (_e, req: UpdatePartyRequest) => {
    const result = service.party.updateParty(req.partyId, req.patch, req.expectedVersion, ACTOR);
    return { ...result.value, changeEventId: result.changeEventId };
  });
  ipcMain.handle(IPC.DELETE_PARTY, (_e, req: DeletePartyRequest) => {
    const result = service.party.deleteParty(req.partyId, ACTOR);
    return { changeEventId: result.changeEventId };
  });
  ipcMain.handle(IPC.UPSERT_PARTY_SLOT, (_e, req: UpsertPartySlotRequest) => {
    const result = service.party.upsertPartySlot(
      req.partyId,
      req.slot,
      req.set,
      ACTOR,
      req.expectedVersion,
    );
    return { ...result.value, changeEventId: result.changeEventId };
  });
  ipcMain.handle(IPC.DELETE_PARTY_SLOT, (_e, req: DeletePartySlotRequest) => {
    const result = service.party.deletePartySlot(req.partyId, req.slot, ACTOR);
    return { changeEventId: result.changeEventId };
  });
  ipcMain.handle(IPC.CHANGE_EVENTS_SINCE, (_e, req: ChangeEventsSinceRequest) =>
    service.listChangeEventsSince(req.sinceId),
  );
}

function bridgeChangeBus(service: DataService): () => void {
  const listener = (event: ChangeEventPush): void => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC.CHANGE_EVENT, event);
    }
  };
  return service.bus.onChange(listener);
}

app
  .whenReady()
  .then(() => {
    dataService = createDataService({ dbPath: resolveDbPath() });
    registerIpc(dataService);
    mainWindow = createWindow();
    unsubscribeBus = bridgeChangeBus(dataService);

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow();
      }
    });
  })
  .catch((err) => {
    console.error("[poke-mate] fatal during startup:", err);
    dataService?.close();
    app.exit(1);
  });

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  unsubscribeBus?.();
  unsubscribeBus = null;
  dataService?.close();
  dataService = null;
  mainWindow = null;
});

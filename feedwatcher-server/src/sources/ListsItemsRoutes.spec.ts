import Fastify, { FastifyInstance } from "fastify";
import { SourceItem } from "../model/SourceItem";
import { ListsItemsRoutes } from "./ListsItemsRoutes";
import {
  ListsItemsDataAdd,
  ListsItemsDataDeleteForUser,
  ListsItemsDataGetItemForUser,
} from "./ListsItemsData";
import { AuthGetUserSession } from "../users/Auth";

jest.mock("../OTelContext", () => ({
  OTelRequestSpan: jest.fn(() => ({})),
}));

jest.mock("../users/Auth", () => ({
  AuthGetUserSession: jest.fn(),
}));

jest.mock("./ListsItemsData", () => ({
  ListsItemsDataAdd: jest.fn(),
  ListsItemsDataDeleteForUser: jest.fn(),
  ListsItemsDataGetItemForUser: jest.fn(),
}));

describe("ListsItemsRoutes", () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.mocked(AuthGetUserSession).mockResolvedValue({
      isAuthenticated: true,
      userId: "user-1",
    });
    fastify = Fastify();
    await new ListsItemsRoutes().getRoutes(fastify);
  });

  afterEach(async () => {
    await fastify.close();
  });

  test("waits for a bookmark save before returning and exposes it in the status lookup", async () => {
    let finishSave: () => void;
    let signalSaveStarted: () => void;
    const saveStarted = new Promise<void>((resolve) => {
      signalSaveStarted = resolve;
    });
    let isSaved = false;
    jest.mocked(ListsItemsDataAdd).mockImplementation(async () => {
      signalSaveStarted();
      await new Promise<void>((resolve) => {
        finishSave = resolve;
      });
      isSaved = true;
    });
    jest.mocked(ListsItemsDataGetItemForUser).mockImplementation(async () =>
      isSaved ? new SourceItem() : null
    );

    const responsePromise = fastify.inject({
      method: "PUT",
      url: "/items",
      payload: { itemId: "item-1" },
    });
    await saveStarted;

    const resultBeforeSaveCompletes = await Promise.race([
      responsePromise.then(() => "response"),
      new Promise<string>((resolve) =>
        setImmediate(() => resolve("pending"))
      ),
    ]);
    expect(resultBeforeSaveCompletes).toBe("pending");

    finishSave();
    const saveResponse = await responsePromise;
    expect(saveResponse.statusCode).toBe(201);

    const statusResponse = await fastify.inject({
      method: "GET",
      url: "/items/item-1",
    });
    expect(statusResponse.statusCode).toBe(201);
    expect(JSON.parse(statusResponse.body)).toEqual(
      expect.objectContaining({ id: expect.any(String) })
    );
  });

  test("waits for a bookmark delete before returning", async () => {
    let finishDelete: () => void;
    let signalDeleteStarted: () => void;
    const deleteStarted = new Promise<void>((resolve) => {
      signalDeleteStarted = resolve;
    });
    jest.mocked(ListsItemsDataDeleteForUser).mockImplementation(async () => {
      signalDeleteStarted();
      await new Promise<void>((resolve) => {
        finishDelete = resolve;
      });
    });

    const responsePromise = fastify.inject({
      method: "DELETE",
      url: "/items/item-1",
    });
    await deleteStarted;

    const resultBeforeDeleteCompletes = await Promise.race([
      responsePromise.then(() => "response"),
      new Promise<string>((resolve) =>
        setImmediate(() => resolve("pending"))
      ),
    ]);
    expect(resultBeforeDeleteCompletes).toBe("pending");

    finishDelete();
    const response = await responsePromise;
    expect(response.statusCode).toBe(202);
  });
});

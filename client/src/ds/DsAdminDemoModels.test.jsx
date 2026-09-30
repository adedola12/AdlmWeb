// Adding a sample model: create the row, upload to storage, confirm it landed.
//
// The three steps exist because a Revit model is hundreds of megabytes and must
// not pass through the API. That shape is also where this screen can go wrong in
// ways nobody would notice: a failed upload leaving an invisible row, a publish
// offered on a model whose file never arrived, or a signed PUT sent with the
// wrong content type so it fails its own signature. Those are what these pin.

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

let answer = async () => ({ ok: true, items: [] });
const calls = [];

vi.mock("../api.js", () => ({
  apiAuthed: vi.fn(async (path, opts) => {
    calls.push({ path, method: opts?.method || "GET", body: opts?.body });
    return answer(path, opts);
  }),
}));
vi.mock("../store.jsx", () => ({ useAuth: () => ({ accessToken: "t", user: {} }) }));

const { default: DsAdminDemoModels } = await import("./DsAdminDemoModels.jsx");

const mount = () =>
  render(
    <MemoryRouter>
      <DsAdminDemoModels />
    </MemoryRouter>,
  );

const model = (extra) => ({
  id: "m1",
  title: "Ikoyi duplex",
  description: "Two storeys, fully detailed",
  purpose: "demo",
  productKey: "revit",
  access: "signed-in",
  fileName: "ikoyi-duplex.rvt",
  format: "rvt",
  sizeBytes: 314_572_800,
  uploadedAt: "2026-09-25T09:00:00Z",
  published: true,
  ready: true,
  ...extra,
});

// A stand-in for the signed PUT. Records what it was sent and lets a test
// decide whether storage accepted it.
let puts = [];
let putStatus = 200;

class FakeXhr {
  constructor() {
    this.upload = {};
    this.status = 0;
  }
  open(method, url) {
    this.method = method;
    this.url = url;
    this.headers = {};
  }
  setRequestHeader(k, v) {
    this.headers[k] = v;
  }
  send(body) {
    puts.push({ method: this.method, url: this.url, headers: this.headers, body });
    this.status = putStatus;
    // Report some progress, then finish, the way a real upload does.
    this.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 200 });
    this.onload?.();
  }
}

beforeEach(() => {
  calls.length = 0;
  puts = [];
  putStatus = 200;
  answer = async () => ({ ok: true, items: [] });
  globalThis.XMLHttpRequest = FakeXhr;
});
afterEach(cleanup);

const pickFile = (name = "ikoyi.rvt", bytes = 200) => {
  const input = document.getElementById("f-model");
  const file = new File([new Uint8Array(bytes)], name, { type: "application/octet-stream" });
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
  return file;
};

describe("the library", () => {
  it("lists a model with its size and who may take it", async () => {
    answer = async () => ({ ok: true, items: [model()] });
    mount();
    await waitFor(() => expect(screen.getByText("Ikoyi duplex")).toBeTruthy());
    expect(screen.getByText("300 MB")).toBeTruthy();
    expect(screen.getByText("Signed in")).toBeTruthy();
    expect(screen.getByText("QUIV (Revit)")).toBeTruthy();
  });

  it("marks a row whose file never arrived, rather than hiding it", async () => {
    // The row is created BEFORE the bytes are sent precisely so a stopped
    // upload is visible instead of vanishing.
    answer = async () => ({ ok: true, items: [model({ ready: false, published: false })] });
    mount();
    await waitFor(() => expect(screen.getByText("No file")).toBeTruthy());
  });

  it("will NOT offer to publish a model with no file", async () => {
    answer = async () => ({ ok: true, items: [model({ ready: false, published: false })] });
    mount();
    await waitFor(() => expect(screen.getByText("Publish")).toBeTruthy());
    // The server refuses it too; offering the button would just produce an
    // error the admin did nothing to deserve.
    expect(screen.getByText("Publish").disabled).toBe(true);
  });

  it("does NOT make a failed read look like an empty library", async () => {
    answer = async () => {
      throw new Error("500");
    };
    mount();
    await waitFor(() => expect(screen.getByText(/could not be read/)).toBeTruthy());
    expect(screen.queryByText("No sample models yet")).toBe(null);
  });

  it("says the stored file was left behind, because the server leaves it", async () => {
    // Claiming the file is gone when it is not is how an orphaned bucket grows
    // quietly. The server returns the note; the screen repeats it.
    answer = async (path, opts) => {
      if (opts?.method === "DELETE") return { ok: true, note: "The row is gone; the stored file was left in place." };
      return { ok: true, items: [model()] };
    };
    mount();
    await waitFor(() => expect(screen.getByText("Remove")).toBeTruthy());
    fireEvent.click(screen.getByText("Remove"));
    await waitFor(() => expect(screen.getByText(/stored file was left in place/)).toBeTruthy());
  });
});

describe("adding one", () => {
  const openForm = async () => {
    mount();
    await waitFor(() => expect(screen.getByText("Add a model")).toBeTruthy());
    fireEvent.click(screen.getByText("Add a model"));
    await waitFor(() => expect(document.getElementById("f-model")).toBeTruthy());
  };

  it("refuses to start with no file chosen", async () => {
    answer = async () => ({ ok: true, items: [] });
    await openForm();
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "A demo" } });
    fireEvent.click(screen.getByText("Upload"));
    await waitFor(() => expect(screen.getByText("Choose the model file.")).toBeTruthy());
    // Nothing was created, so there is no orphan row to clean up.
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("creates the row, uploads to storage, then confirms it landed", async () => {
    answer = async (path, opts) => {
      if (path === "/admin/demo-models" && opts?.method === "POST") {
        return {
          ok: true,
          id: "new1",
          uploadUrl: "https://storage.example/put/new1",
          contentType: "application/octet-stream",
        };
      }
      return { ok: true, items: [] };
    };
    await openForm();
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Ikoyi duplex" } });
    pickFile();
    fireEvent.click(screen.getByText("Upload"));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].method).toBe("PUT");
    expect(puts[0].url).toBe("https://storage.example/put/new1");
    // The signature was made for this content type. Sending another makes the
    // request fail its own signature, which reads as a storage outage.
    expect(puts[0].headers["Content-Type"]).toBe("application/octet-stream");

    await waitFor(() =>
      expect(calls.some((c) => c.path === "/admin/demo-models/new1/done")).toBe(true),
    );
    await waitFor(() => expect(screen.getByText(/is uploaded/)).toBeTruthy());
  });

  it("sends the file's real name and size, so the server can refuse it early", async () => {
    // A 3 GB file or a .docx is refused before anything is created. Sending a
    // name without a size would push that refusal to after the upload.
    answer = async (path, opts) =>
      path === "/admin/demo-models" && opts?.method === "POST"
        ? { ok: true, id: "n", uploadUrl: "u", contentType: "application/octet-stream" }
        : { ok: true, items: [] };
    await openForm();
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "X" } });
    pickFile("tower.ifc", 4096);
    fireEvent.click(screen.getByText("Upload"));
    await waitFor(() => expect(puts).toHaveLength(1));
    const created = calls.find((c) => c.path === "/admin/demo-models" && c.method === "POST");
    expect(created.body.fileName).toBe("tower.ifc");
    expect(created.body.size).toBe(4096);
  });

  it("says where a stopped upload went rather than losing it", async () => {
    // The row is already made at this point. Saying nothing would leave an
    // invisible half-model; saying "failed" without saying where is no better.
    putStatus = 403;
    answer = async (path, opts) =>
      path === "/admin/demo-models" && opts?.method === "POST"
        ? { ok: true, id: "n2", uploadUrl: "u", contentType: "application/octet-stream" }
        : { ok: true, items: [] };
    await openForm();
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "X" } });
    pickFile();
    fireEvent.click(screen.getByText("Upload"));
    // The message names the storage status AND where the half-made row went.
    // ("Not published" on its own would be vacuous — it is also a filter tab.)
    await waitFor(() => expect(screen.getByText(/did not finish/)).toBeTruthy());
    expect(screen.getByText(/403/)).toBeTruthy();
    expect(screen.getByText(/under Not published/)).toBeTruthy();
    // It never claims the model is ready.
    expect(screen.queryByText(/is uploaded/)).toBe(null);
    // And it never says the upload succeeded by calling `done`.
    expect(calls.some((c) => String(c.path).endsWith("/done"))).toBe(false);
  });

  it("asks for a course when the model is a course file", async () => {
    answer = async (path) =>
      path === "/admin/courses"
        ? { items: [{ sku: "quiv-101", title: "QUIV for quantity surveyors" }] }
        : { ok: true, items: [] };
    await openForm();
    fireEvent.change(screen.getByLabelText(/What it is for/), { target: { value: "course" } });
    await waitFor(() => expect(screen.getByLabelText(/^Course/)).toBeTruthy());
    // And the access question disappears: a course model's audience IS the
    // course, set server-side.
    expect(screen.queryByLabelText(/Who may download it/)).toBe(null);

    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Week 1 model" } });
    pickFile();
    fireEvent.click(screen.getByText("Upload"));
    await waitFor(() => expect(screen.getByText(/Choose the course/)).toBeTruthy());
    expect(puts).toHaveLength(0);
  });

  it("names the course by SKU, not by id", async () => {
    // A learner's enrolment carries courseSku. An ObjectId here would refuse
    // every course model to the students it was made for.
    answer = async (path, opts) => {
      if (path === "/admin/courses") {
        return { items: [{ _id: "652f00000000000000000001", sku: "quiv-101", title: "QUIV 101" }] };
      }
      if (path === "/admin/demo-models" && opts?.method === "POST") {
        return { ok: true, id: "n3", uploadUrl: "u", contentType: "application/octet-stream" };
      }
      return { ok: true, items: [] };
    };
    await openForm();
    fireEvent.change(screen.getByLabelText(/What it is for/), { target: { value: "course" } });
    await waitFor(() => expect(screen.getByLabelText(/^Course/)).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/^Course/), { target: { value: "quiv-101" } });
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Week 1 model" } });
    pickFile();
    fireEvent.click(screen.getByText("Upload"));
    await waitFor(() => expect(puts).toHaveLength(1));
    const created = calls.find((c) => c.path === "/admin/demo-models" && c.method === "POST");
    expect(created.body.courseSku).toBe("quiv-101");
    expect(created.body.access).toBe("course");
  });

  it("offers only the file types the server accepts", async () => {
    answer = async () => ({
      ok: true,
      items: [],
      formats: [
        { key: "rvt", ext: ".rvt", label: "Revit model" },
        { key: "ifc", ext: ".ifc", label: "IFC model" },
      ],
    });
    await openForm();
    // The list comes from the server's own MODEL_FORMATS. It used to be built
    // from Object.keys of a frozen ARRAY, which answered ["0","1","2","3"].
    expect(document.getElementById("f-model").accept).toBe(".rvt,.ifc");
  });
});

describe("what the filters count", () => {
  it("separates course files, demos and unfinished uploads", async () => {
    answer = async () => ({
      ok: true,
      items: [
        model({ id: "a", purpose: "course", courseSku: "quiv-101", courseTitle: "QUIV 101" }),
        model({ id: "b", purpose: "demo" }),
        model({ id: "c", purpose: "demo", ready: false, published: false }),
      ],
    });
    mount();
    await waitFor(() => expect(screen.getByRole("tab", { name: /All/ })).toBeTruthy());
    expect(within(screen.getByRole("tab", { name: /All/ })).getByText("3")).toBeTruthy();
    expect(within(screen.getByRole("tab", { name: /Course files/ })).getByText("1")).toBeTruthy();
    expect(within(screen.getByRole("tab", { name: /Software demos/ })).getByText("2")).toBeTruthy();
    expect(within(screen.getByRole("tab", { name: /Not published/ })).getByText("1")).toBeTruthy();
  });
});

describe("correcting a model without re-uploading it", () => {
  // PATCH has always accepted title, description, productKey, access and
  // published, and the only thing that called it sent { published }. So an admin
  // who mistyped a title had to REMOVE a 700 MB upload and do it again.

  it("offers an Edit control on a row", async () => {
    answer = async () => ({ ok: true, items: [model()] });
    mount();
    await waitFor(() => expect(screen.getByText("Edit")).toBeTruthy());
  });

  it("saves the title and audience without touching the file", async () => {
    answer = async () => ({ ok: true, items: [model()] });
    mount();
    await waitFor(() => expect(screen.getByText("Edit")).toBeTruthy());
    fireEvent.click(screen.getByText("Edit"));
    await waitFor(() => expect(screen.getByLabelText(/^Name/)).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Ikoyi duplex v2" } });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() =>
      expect(calls.some((c) => c.path === "/admin/demo-models/m1" && c.method === "PATCH")).toBe(
        true,
      ),
    );
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch.body.title).toBe("Ikoyi duplex v2");
    // No file is sent, and nothing is uploaded.
    expect(patch.body.fileName).toBe(undefined);
    expect(puts).toHaveLength(0);
  });

  it("does not offer to change WHO may download a course model", async () => {
    // A course model's audience is its course, set server-side — the endpoint
    // would refuse anything else, so asking would be a dead control.
    answer = async () => ({
      ok: true,
      items: [model({ purpose: "course", courseSku: "quiv-101", courseTitle: "QUIV 101" })],
    });
    mount();
    await waitFor(() => expect(screen.getByText("Edit")).toBeTruthy());
    fireEvent.click(screen.getByText("Edit"));
    await waitFor(() => expect(screen.getByLabelText(/^Name/)).toBeTruthy());
    expect(screen.queryByLabelText(/Who may download it/)).toBe(null);
  });

  it("will not save an empty name", async () => {
    answer = async () => ({ ok: true, items: [model()] });
    mount();
    await waitFor(() => expect(screen.getByText("Edit")).toBeTruthy());
    fireEvent.click(screen.getByText("Edit"));
    await waitFor(() => expect(screen.getByLabelText(/^Name/)).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "" } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(screen.getByText("This is needed.")).toBeTruthy());
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
  });
});

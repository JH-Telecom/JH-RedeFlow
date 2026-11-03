import { type Call } from "../api";

export type ManualProductionActivity = {
  type: string;
  pending: number;
  enRoute: number;
  started: number;
  concluded: number;
  cancelled: number;
  suspended: number;
  total: number;
};

export type ManualProductionTechnician = {
  name: string;
  pending: number;
  enRoute: number;
  started: number;
  concluded: number;
  cancelled: number;
  suspended: number;
  total: number;
};

export type ManualProductionOrder = {
  order: string;
  technician: string;
  inicio: string;
  tempo: string;
};

export type ManualProductionRecord = {
  activityType: string;
  technician: string;
  status: string;
  order: string;
  inicio: string;
  tempo: string;
};

export type ManualProductionData = {
  activities: ManualProductionActivity[];
  technicians: ManualProductionTechnician[];
  orders: ManualProductionOrder[];
  records?: ManualProductionRecord[];
  updatedAt: string;
};

export function parseDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  cells.push(current.trim());
  return cells;
}

export function splitCsvLikeLine(line: string): string[] {
  const delimiters = [";", ",", "\t"];
  const counts = delimiters.map((delimiter) => {
    const parsed = parseDelimitedLine(line, delimiter);
    return { delimiter, count: parsed.length > 1 ? parsed.length : 0 };
  });

  const bestDelimiter = counts.sort((left, right) => right.count - left.count)[0]?.delimiter ?? ",";
  return parseDelimitedLine(line, bestDelimiter);
}

export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const allowedActivityTypes = new Set([
  "manutencao preventiva de rede",
  "manutencao corretiva de rede",
  "manutencao de rede field",
]);

export function incrementProductionStatus(item: ManualProductionActivity | ManualProductionTechnician, status: string) {
  const normalizedStatus = normalizeText(status);
  if (normalizedStatus === "pendente") item.pending += 1;
  if (normalizedStatus === "em rota") item.enRoute += 1;
  if (normalizedStatus === "iniciado") item.started += 1;
  if (normalizedStatus === "concluido") item.concluded += 1;
  if (normalizedStatus === "cancelado") item.cancelled += 1;
  if (normalizedStatus === "suspenso") item.suspended += 1;
  item.total += 1;
}

export function parseFlatActivityExport(rows: string[][]): ManualProductionData {
  const activities = new Map<string, ManualProductionActivity>();
  const technicians = new Map<string, ManualProductionTechnician>();
  const orders: ManualProductionOrder[] = [];
  const records: ManualProductionRecord[] = [];

  for (const cells of rows.slice(1)) {
    if (cells.length < 25) continue;

    const technicianName = cells[0]?.trim();
    const status = cells[2]?.trim() ?? "";
    const activityType = cells[23]?.trim();
    const order = cells[24]?.trim();
    if (!activityType || !allowedActivityTypes.has(normalizeText(activityType))) continue;

    const activity = activities.get(activityType) ?? {
      type: activityType,
      pending: 0,
      enRoute: 0,
      started: 0,
      concluded: 0,
      cancelled: 0,
      suspended: 0,
      total: 0,
    };
    incrementProductionStatus(activity, status);
    activities.set(activityType, activity);
    const record = { activityType, technician: technicianName || "", status, order: order || "", inicio: cells[15]?.trim() ?? "", tempo: cells[20]?.trim() ?? "" };
    records.push(record);

    if (technicianName) {
      const technician = technicians.get(technicianName) ?? {
        name: technicianName,
        pending: 0,
        enRoute: 0,
        started: 0,
        concluded: 0,
        cancelled: 0,
        suspended: 0,
        total: 0,
      };
      incrementProductionStatus(technician, status);
      technicians.set(technicianName, technician);
    }

    if (order && normalizeText(status) === "iniciado") {
      orders.push({ order, technician: technicianName, inicio: record.inicio, tempo: record.tempo });
    }
  }

  return {
    activities: [...activities.values()].filter((item) => allowedActivityTypes.has(normalizeText(item.type))),
    technicians: [...technicians.values()],
    orders,
    records,
    updatedAt: new Date().toLocaleString("pt-BR"),
  };
}

export function parseManualProductionData(raw: string): ManualProductionData {
  const rows = raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s+|\s+$/g, ""))
    .filter(Boolean);

  if (!rows.length) {
    return { activities: [], technicians: [], orders: [], updatedAt: new Date().toLocaleString("pt-BR") };
  }

  const firstRow = splitCsvLikeLine(rows[0]);
  const flatHeader = firstRow.map(normalizeText);
  const activityTypeHeaderCount = flatHeader.filter((cell) => /^tipo de atividade(?:\s*\d+)?$/.test(cell)).length;
  const isFlatActivityExport = flatHeader.includes("recurso")
    && flatHeader.includes("status da atividade")
    && activityTypeHeaderCount >= 2
    && flatHeader.includes("ordem de servico");
  if (isFlatActivityExport) {
    return parseFlatActivityExport(rows.map(splitCsvLikeLine));
  }

  const activities: ManualProductionActivity[] = [];
  const technicians: ManualProductionTechnician[] = [];
  const orders: ManualProductionOrder[] = [];

  let section: "activity" | "technician" | "orders" | null = null;

  for (const row of rows) {
    const cells = splitCsvLikeLine(row)
      .map((cell) => cell.trim())
      .filter((cell) => cell.length > 0);

    if (!cells.length) continue;

    const normalizedCells = cells.map(normalizeText);
    const label = normalizedCells.join(" ");
    const hasNumericColumns = ["pendente", "em rota", "iniciado", "concluido", "cancelado", "suspenso", "total"]
      .filter((column) => normalizedCells.includes(column)).length >= 3;
    const isActivityHeader = normalizedCells.some((cell) => cell.includes("tipo da atividade"));
    const isTechnicianHeader = normalizedCells.some((cell) => cell === "tecnico" || cell === "tecnicos") && hasNumericColumns;
    const isOrdersHeader = normalizedCells.some((cell) => cell === "order" || cell === "orders" || cell === "ordem" || cell === "ordens")
      && normalizedCells.some((cell) => cell.includes("inicio") || cell.includes("tempo"));

    if (isActivityHeader || label.includes("producao por atividades")) {
      section = "activity";
      continue;
    }
    if (isTechnicianHeader || label.includes("producao por tecnico") || label.includes("prod por tecnico")) {
      section = "technician";
      continue;
    }
    if (isOrdersHeader || label.includes("ordens iniciadas") || label.includes("dados da planilha") || label === "orders" || label === "ordens") {
      section = "orders";
      continue;
    }
    if (label.includes("soma") && section === "activity") {
      continue;
    }

    if (section === "activity" && cells.length >= 8) {
      const [type, pending, enRoute, started, concluded, cancelled, suspended, total] = cells;
      if (type && /[A-Za-zÀ-ÿ]/.test(type) && /\d/.test(String(total ?? ""))) {
        activities.push({
          type,
          pending: Number(String(pending ?? "0").replace(/[^0-9]/g, "")) || 0,
          enRoute: Number(String(enRoute ?? "0").replace(/[^0-9]/g, "")) || 0,
          started: Number(String(started ?? "0").replace(/[^0-9]/g, "")) || 0,
          concluded: Number(String(concluded ?? "0").replace(/[^0-9]/g, "")) || 0,
          cancelled: Number(String(cancelled ?? "0").replace(/[^0-9]/g, "")) || 0,
          suspended: Number(String(suspended ?? "0").replace(/[^0-9]/g, "")) || 0,
          total: Number(String(total ?? "0").replace(/[^0-9]/g, "")) || 0,
        });
      }
      continue;
    }

    if (section === "technician" && cells.length >= 8) {
      const [name, pending, enRoute, started, concluded, cancelled, suspended, total] = cells;
      if (name && /[A-Za-zÀ-ÿ]/.test(name) && /\d/.test(String(total ?? ""))) {
        technicians.push({
          name,
          pending: Number(String(pending ?? "0").replace(/[^0-9]/g, "")) || 0,
          enRoute: Number(String(enRoute ?? "0").replace(/[^0-9]/g, "")) || 0,
          started: Number(String(started ?? "0").replace(/[^0-9]/g, "")) || 0,
          concluded: Number(String(concluded ?? "0").replace(/[^0-9]/g, "")) || 0,
          cancelled: Number(String(cancelled ?? "0").replace(/[^0-9]/g, "")) || 0,
          suspended: Number(String(suspended ?? "0").replace(/[^0-9]/g, "")) || 0,
          total: Number(String(total ?? "0").replace(/[^0-9]/g, "")) || 0,
        });
      }
      continue;
    }

    if (section === "orders" && cells.length >= 4) {
      const [order, technician, inicio, tempo] = cells;
      if (order && /[A-Za-z0-9]/.test(order) && !order.toLowerCase().includes("orders")) {
        orders.push({ order, technician: technician || "", inicio: inicio || "", tempo: tempo || "" });
      }
    }
  }

  return {
    activities: activities.filter((item) => item.type && allowedActivityTypes.has(normalizeText(item.type))),
    technicians: technicians.filter((item) => item.name && item.name !== ""),
    orders: orders.filter((item) => item.order && item.order !== ""),
    updatedAt: new Date().toLocaleString("pt-BR"),
  };
}

export function sumProductionRows(rows: Array<ManualProductionActivity | ManualProductionTechnician>) {
  return rows.reduce((total, item) => ({
    pending: total.pending + item.pending,
    enRoute: total.enRoute + item.enRoute,
    started: total.started + item.started,
    concluded: total.concluded + item.concluded,
    cancelled: total.cancelled + item.cancelled,
    suspended: total.suspended + item.suspended,
    total: total.total + item.total,
  }), { pending: 0, enRoute: 0, started: 0, concluded: 0, cancelled: 0, suspended: 0, total: 0 });
}

export type ManualDashboardArea = "guarulhos" | "sp";

export type ManualDashboardSegment = { activities: ManualProductionActivity[]; technicians: ManualProductionTechnician[]; orders: ManualProductionOrder[]; recordCount: number; unmatchedOrderCount: number };

export function normalizeOrderMatchKey(value: string) {
  return normalizeText(value).replace(/[^a-z0-9]/g, "").replace(/^bdesk/, "");
}

export function buildManualDashboardSegments(records: ManualProductionRecord[], calls: Call[]): Record<ManualDashboardArea, ManualDashboardSegment> {
  const regionByOrder = new Map<string, string>();
  calls.forEach((call) => {
    const key = normalizeOrderMatchKey(call.orderNumber);
    if (!key || !call.region) return;
    const existingRegion = regionByOrder.get(key);
    if (existingRegion && normalizeText(existingRegion) !== normalizeText(call.region)) regionByOrder.set(key, "");
    else if (!regionByOrder.has(key)) regionByOrder.set(key, call.region);
  });

  const createSegment = () => ({ activityMap: new Map<string, ManualProductionActivity>(), technicianMap: new Map<string, ManualProductionTechnician>(), orders: [] as ManualProductionOrder[], recordCount: 0, unmatchedOrders: new Set<string>() });
  const segments = { guarulhos: createSegment(), sp: createSegment() };
  records.forEach((record) => {
    const orderKey = normalizeOrderMatchKey(record.order);
    const region = orderKey ? regionByOrder.get(orderKey) : undefined;
    const area: ManualDashboardArea = normalizeText(region || "").includes("guarulhos") ? "guarulhos" : "sp";
    const segment = segments[area];
    segment.recordCount += 1;
    if (record.order && !region) segment.unmatchedOrders.add(orderKey || record.order);

    const activity = segment.activityMap.get(record.activityType) ?? { type: record.activityType, pending: 0, enRoute: 0, started: 0, concluded: 0, cancelled: 0, suspended: 0, total: 0 };
    incrementProductionStatus(activity, record.status);
    segment.activityMap.set(record.activityType, activity);

    if (record.technician) {
      const technician = segment.technicianMap.get(record.technician) ?? { name: record.technician, pending: 0, enRoute: 0, started: 0, concluded: 0, cancelled: 0, suspended: 0, total: 0 };
      incrementProductionStatus(technician, record.status);
      segment.technicianMap.set(record.technician, technician);
    }
    if (orderKey && normalizeText(record.status) === "iniciado") segment.orders.push({ order: record.order, technician: record.technician, inicio: record.inicio, tempo: record.tempo });
  });

  return {
    guarulhos: { activities: [...segments.guarulhos.activityMap.values()], technicians: [...segments.guarulhos.technicianMap.values()], orders: segments.guarulhos.orders, recordCount: segments.guarulhos.recordCount, unmatchedOrderCount: segments.guarulhos.unmatchedOrders.size },
    sp: { activities: [...segments.sp.activityMap.values()], technicians: [...segments.sp.technicianMap.values()], orders: segments.sp.orders, recordCount: segments.sp.recordCount, unmatchedOrderCount: segments.sp.unmatchedOrders.size },
  };
}

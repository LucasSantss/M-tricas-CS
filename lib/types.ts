export type ConfigResponse = {
  chatbotUrl: string | null;
  hasToken: boolean;
  useBusinessHours: boolean;
  getCurrent: boolean;
};

export type DepartmentDto = {
  id: number;
  departmentId: string;
  name: string;
  active: boolean;
  sortOrder: number;
  goalTmeSeconds: number;
  goalTmaSeconds: number;
  goalTmrSeconds: number;
  goalCsat: number;
  attendantIds: string[];
};

export type WeekDto = { mondayDate: string; label: string; start: string; end: string };

export type SuriDepartmentDto = { id: string; name: string };
export type SuriAttendantDto = { id: string; name: string; email: string | null };

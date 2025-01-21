import * as fs from 'fs';
import * as path from 'path';

interface LocalDbResult {
  data: any[] | null;
  error: string | null;
  count?: number;
}

interface QueryFilters {
  eq?: { [key: string]: any };
  in?: { [key: string]: any[] };
  orderBy?: { column: string; ascending: boolean };
  lt?: { [key: string]: any };
  gt?: { [key: string]: any };
  lte?: { [key: string]: any };
  gte?: { [key: string]: any };
}

/**
 * A simplistic local JSON DB fallback to emulate basic Supabase-like operations.
 */
export class LocalDb {
  private filePath: string;
  private db: { [tableName: string]: any[] } = {};

  constructor(jsonFileName: string) {
    const resolvedPath = path.join(process.cwd(), jsonFileName);
    this.filePath = resolvedPath;
    // Load or initialize the JSON
    if (fs.existsSync(this.filePath)) {
      this.loadDb();
    } else {
      fs.writeFileSync(this.filePath, JSON.stringify({}));
      this.loadDb();
    }
  }

  /**
   * Mimics supabase.from(tableName) usage
   */
  public from(tableName: string) {
    const self = this;
    return {
      insert: async (rows: any | any[]) => {
        return self.insert(tableName, rows);
      },
      select: function (columns: string, options: { count?: 'exact' | null; head?: boolean } = {}) {
        const { count, head } = options;

        // We'll store our filters here so we can chain them before calling .select()
        const filterObj: QueryFilters = {};
        let limitValue: number | undefined;

        return {
          // eq
          eq: function (field: string, value: any) {
            if (!filterObj.eq) filterObj.eq = {};
            filterObj.eq[field] = value;
            return this;
          },
          // in
          in: function (field: string, values: any[]) {
            if (!filterObj.in) filterObj.in = {};
            filterObj.in[field] = values;
            return this;
          },
          // lt
          lt: function (field: string, value: any) {
            if (!filterObj.lt) filterObj.lt = {};
            filterObj.lt[field] = value;
            return this;
          },
          // gt
          gt: function (field: string, value: any) {
            if (!filterObj.gt) filterObj.gt = {};
            filterObj.gt[field] = value;
            return this;
          },
          // lte
          lte: function (field: string, value: any) {
            if (!filterObj.lte) filterObj.lte = {};
            filterObj.lte[field] = value;
            return this;
          },
          // gte
          gte: function (field: string, value: any) {
            if (!filterObj.gte) filterObj.gte = {};
            filterObj.gte[field] = value;
            return this;
          },
          // order
          order: function (column: string, config: { ascending: boolean }) {
            filterObj.orderBy = { column, ascending: config.ascending };
            return this;
          },
          // limit
          limit: function(value: number) {
            limitValue = value;
            return this;
          },
          // final .select() to actually query
          select: async function () {
            const result = await self.select(tableName, columns, filterObj, count, head);
            
            // Apply limit if set
            if (limitValue && result.data) {
              result.data = result.data.slice(0, limitValue);
            }
            
            return result;
          }
        };
      },
      update: async (rows: any) => {
        return {
          eq: (field: string, value: any) => {
            return self.update(tableName, rows, { eq: { [field]: value } });
          }
        };
      },
      upsert: async (rows: any) => {
        return self.upsert(tableName, rows);
      },
      delete: () => {
        return {
          in: (field: string, values: any[]) => {
            return self.delete(tableName, { in: { [field]: values } });
          },
          eq: (field: string, value: any) => {
            return self.delete(tableName, { eq: { [field]: value } });
          }
        };
      }
    };
  }

  private loadDb() {
    try {
      const fileData = fs.readFileSync(this.filePath, 'utf-8');
      this.db = JSON.parse(fileData);
    } catch (err) {
      this.db = {};
    }
  }

  private writeDb() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.db, null, 2));
  }

  private getTable(tableName: string): any[] {
    if (!this.db[tableName]) {
      this.db[tableName] = [];
    }
    return this.db[tableName];
  }

  private async insert(tableName: string, rows: any | any[]): Promise<LocalDbResult> {
    try {
      const table = this.getTable(tableName);
      const arrayRows = Array.isArray(rows) ? rows : [rows];
      for (const row of arrayRows) {
        if (!row.id) {
          row.id = Date.now() + Math.floor(Math.random() * 10000);
        }
        table.push(row);
      }
      this.writeDb();
      return { data: arrayRows, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  /**
   * Basic select with eq, in, lt, gt, lte, gte filters and order
   */
  private async select(
    tableName: string,
    columns: string,
    filters: QueryFilters,
    countOption?: 'exact' | null,
    headOption?: boolean
  ): Promise<LocalDbResult> {
    try {
      let table = [...this.getTable(tableName)];

      // eq filters
      if (filters.eq) {
        Object.entries(filters.eq).forEach(([field, value]) => {
          table = table.filter((item: any) => item[field] === value);
        });
      }

      // in filters
      if (filters.in) {
        Object.entries(filters.in).forEach(([field, values]) => {
          table = table.filter((item: any) => values.includes(item[field]));
        });
      }

      // lt filters
      if (filters.lt) {
        Object.entries(filters.lt).forEach(([field, value]) => {
          table = table.filter((item: any) => item[field] < value);
        });
      }

      // gt filters
      if (filters.gt) {
        Object.entries(filters.gt).forEach(([field, value]) => {
          table = table.filter((item: any) => item[field] > value);
        });
      }

      // lte filters
      if (filters.lte) {
        Object.entries(filters.lte).forEach(([field, value]) => {
          table = table.filter((item: any) => item[field] <= value);
        });
      }

      // gte filters
      if (filters.gte) {
        Object.entries(filters.gte).forEach(([field, value]) => {
          table = table.filter((item: any) => item[field] >= value);
        });
      }

      // ordering
      if (filters.orderBy) {
        const { column, ascending } = filters.orderBy;
        table.sort((a: any, b: any) => {
          if (a[column] < b[column]) return ascending ? -1 : 1;
          if (a[column] > b[column]) return ascending ? 1 : -1;
          return 0;
        });
      }

      let selectedData = table;
      if (headOption) {
        // if head is true, we want an empty data set but the count
        selectedData = [];
      }

      let rowCount = undefined;
      if (countOption === 'exact') {
        rowCount = table.length;
      }

      return {
        data: selectedData,
        error: null,
        count: rowCount
      };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  private async update(tableName: string, updatedFields: any, filters: QueryFilters): Promise<LocalDbResult> {
    try {
      let table = this.getTable(tableName);
      if (filters.eq) {
        Object.entries(filters.eq).forEach(([field, value]) => {
          table.forEach((item: any) => {
            if (item[field] === value) {
              Object.assign(item, updatedFields);
            }
          });
        });
      }
      this.writeDb();
      return { data: [], error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  private async upsert(tableName: string, rows: any | any[]): Promise<LocalDbResult> {
    const table = this.getTable(tableName);
    const arrayRows = Array.isArray(rows) ? rows : [rows];
    try {
      for (const row of arrayRows) {
        // For points table, use user_id as the unique key
        const uniqueKey = tableName === 'user_points' ? 'user_id' : 'id';
        
        // If no unique key value, generate an id and insert
        if (!row[uniqueKey]) {
          row.id = Date.now() + Math.floor(Math.random() * 10000);
          table.push(row);
          continue;
        }

        // Find existing record based on the unique key
        const existingIndex = table.findIndex((item: any) => item[uniqueKey] === row[uniqueKey]);
        if (existingIndex > -1) {
          // Update existing record while preserving its id
          const existingId = table[existingIndex].id;
          table[existingIndex] = { ...row, id: existingId };
        } else {
          // Insert new record with generated id if not provided
          if (!row.id) {
            row.id = Date.now() + Math.floor(Math.random() * 10000);
          }
          table.push(row);
        }
      }
      this.writeDb();
      return { data: arrayRows, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  }

  private async delete(tableName: string, filters: QueryFilters): Promise<LocalDbResult> {
    let table = this.getTable(tableName);

    // eq filters
    if (filters.eq) {
      Object.entries(filters.eq).forEach(([field, value]) => {
        table = table.filter((item: any) => item[field] !== value);
      });
    }

    // in filters
    if (filters.in) {
      Object.entries(filters.in).forEach(([field, values]) => {
        table = table.filter((item: any) => !values.includes(item[field]));
      });
    }

    this.db[tableName] = table;
    this.writeDb();

    return {
      data: [],
      error: null
    };
  }
}
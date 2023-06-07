export abstract class Enum<T extends string> {
  // eslint-disable-next-line no-useless-constructor
  constructor(public readonly _id: T) {}

  public index(): string {
      return this._id;
  }

  public abstract value(): string;

  public isTypeOf(type: T): boolean {
      return this._id === type;
  }

  public toJSON(): string {
      return this._id;
  }
}
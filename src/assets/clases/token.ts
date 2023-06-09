import moment from 'moment'

export class Token {
  private _created: string

  constructor(created: string, private _expires: string, private _value: string) {
      if (moment(_expires).isBefore(moment(created))) {
          throw new Error('No se puede crear un token con un tiempo de expiracion menor al de creacion')
      }
      this._created = created
  }

  public getCreated(): string {
      return this._created
  }

  public getExpires(): string {
      return this._expires
  }

  public getValue(): string {
      return this._value
  }

 
  public isValueEmpty(): boolean {
      return this._value === ''
  }

 
  public isExpired(): boolean {
      return moment(this._expires).isBefore(moment())
  }

  public isValid(): boolean {
      return !(this.isValueEmpty() || this.isExpired());
  }

  public toJSON(): { created: string; expires: string; value: string } {
      return {
          created: this._created,
          expires: this._expires,
          value: this._value
      };
  }
}

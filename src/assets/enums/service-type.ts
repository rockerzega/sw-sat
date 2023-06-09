import { Enum } from '@/src/assets/libs/enum'

export type ServiceTypeValues = 'cfdi' | 'retenciones';

enum ServiceTypeEnum {
    cfdi = 'cfdi',
    retenciones = 'retenciones'
}

export class ServiceType extends Enum<ServiceTypeValues> {
    public equalTo(serviceType: ServiceType): boolean {
        return this._id === serviceType._id;
    }

    public value(): string {
        return ServiceTypeEnum[this._id];
    }
}

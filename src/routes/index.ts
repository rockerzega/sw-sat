import { Router } from 'restify-router'
import Auth from '@/src/routes/auth'
import Solicitud from '@/src/routes/solicitud'
import Verificacion from '@/src/routes/verificacion'
import Descarga from '@/src/routes/descarga'

const router = new Router()

router.add('/auth', Auth)
router.add('/solicitud', Solicitud)
router.add('/verificacion', Verificacion)
router.add('/descarga', Descarga)

export default router

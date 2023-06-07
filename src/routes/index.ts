import { Router } from 'restify-router'
import Auth from '@/src/routes/auth'
import Solicitud from '@/src/routes/solicitud'

const router = new Router()

router.add('/auth', Auth)
router.add('/solicitud', Solicitud)

export default router

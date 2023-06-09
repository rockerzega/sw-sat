import { Router } from 'restify-router'
import { Credential } from '@nodecfdi/credentials'
import { getAuthorizacion } from '../assets/libs/authorizacion'

const router = new Router()

router.post('', async (req, res) => {  
  try {

    const certificatePath = req.files?.cert.path
    const keyPath = req.files?.keyPEM.path
    const { password } = req.body
    
    const fiel: Credential = Credential.openFiles(certificatePath, keyPath, password)
    
    const respuesta = await getAuthorizacion(fiel)

    res.json(respuesta)
    } catch (error) {
      throw new Error(`HTTP Error: ${error.message}`);
    }
})

export default router

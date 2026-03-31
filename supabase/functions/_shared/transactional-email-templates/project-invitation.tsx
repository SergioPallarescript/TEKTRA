/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'TEKTRA'

interface ProjectInvitationProps {
  projectName?: string
  roleName?: string
  inviterName?: string
  inviterRole?: string
  siteUrl?: string
}

const ProjectInvitationEmail = ({
  projectName,
  roleName,
  inviterName,
  inviterRole,
  siteUrl = 'https://tektra.es',
}: ProjectInvitationProps) => (
  <Html lang="es" dir="ltr">
    <Head>
      <meta charSet="utf-8" />
    </Head>
    <Preview>
      🏗️ Invitaci&oacute;n al proyecto{projectName ? `: ${projectName}` : ''} en TEKTRA
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          Has sido invitado a un proyecto en TEKTRA
        </Heading>
        <Text style={text}>
          {inviterName ? (
            <>
              <strong>{inviterName}</strong>
              {inviterRole ? <> ({inviterRole})</> : null}
              {' '}te ha
            </>
          ) : (
            'Se te ha'
          )}{' '}
          invitado a participar en el proyecto{' '}
          {projectName ? <strong>{projectName}</strong> : 'de obra'} dentro de
          la plataforma TEKTRA.
        </Text>
        {roleName && (
          <Text style={text}>
            Tu rol asignado: <strong>{roleName}</strong>
          </Text>
        )}
        <Text style={text}>
          Para configurar tu acceso, reg&iacute;strate con este mismo correo
          electr&oacute;nico en la plataforma:
        </Text>
        <Button style={button} href={siteUrl}>
          Acceder a TEKTRA
        </Button>
        <Text style={footer}>
          Este es un correo autom&aacute;tico de TEKTRA. No es necesario
          responder.
        </Text>
        <Text style={brand}>
          TEKTRA &mdash; Direcci&oacute;n y Ejecuci&oacute;n de Obra Profesional
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ProjectInvitationEmail,
  subject: (data: Record<string, any>) =>
    data.projectName
      ? `🏗️ Invitación al proyecto: ${data.projectName} en TEKTRA`
      : '🏗️ Invitación al proyecto en TEKTRA',
  displayName: 'Invitación a proyecto',
  previewData: {
    projectName: 'Residencial Los Olivos',
    roleName: 'Director de Obra (DO)',
    inviterName: 'Juan Pérez',
    inviterRole: 'DEM — Dir. Ejecución Material (Arq. Técnico)',
    siteUrl: 'https://tektra.es',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Montserrat', Arial, sans-serif" }
const container = { padding: '20px 25px' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#000000',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: '#55575d',
  lineHeight: '1.5',
  margin: '0 0 25px',
}
const button = {
  backgroundColor: '#000000',
  color: '#ffffff',
  fontSize: '14px',
  borderRadius: '8px',
  padding: '12px 20px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
const brand = { fontSize: '10px', color: '#bbbbbb', margin: '10px 0 0', textAlign: 'center' as const }

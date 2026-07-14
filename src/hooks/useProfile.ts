import { useQuery } from '@tanstack/react-query'
import { repo } from '../data'

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: () => repo.getProfile(),
    staleTime: Infinity,
  })
}
